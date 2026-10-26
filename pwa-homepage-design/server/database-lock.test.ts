import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { acquireDatabaseLock, DatabaseLockError } from './database-lock'

const lockPath = (directory: string) => join(dirname(directory), `.${basename(directory)}.lock`)
const isCode = (code: string) => (error: unknown) => error instanceof DatabaseLockError && error.code === code

async function fixture(work: (directory: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'knowbetter-lock-'))
  try { await work(join(root, 'database')) }
  finally { await rm(root, { recursive: true, force: true }) }
}

type ChildResult = { ok: true; pid: number } | { ok: false; code: string }

async function contender(directory: string): Promise<{ child: ChildProcess; result: ChildResult; exit: Promise<unknown[]> }> {
  const moduleUrl = pathToFileURL(join(process.cwd(), 'server/database-lock.ts')).href
  const code = `
    import { acquireDatabaseLock } from ${JSON.stringify(moduleUrl)};
    try {
      const release = await acquireDatabaseLock(process.argv[1]);
      process.send({ ok: true, pid: process.pid });
      process.once('message', async () => { await release(); process.disconnect(); });
    } catch (error) { process.send({ ok: false, code: error.code }); process.disconnect(); }
  `
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, directory], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
  const exit = once(child, 'exit')
  const result = await new Promise<ChildResult>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Lock child did not answer')) }, 10_000)
    child.once('message', value => { clearTimeout(timeout); resolve(value as ChildResult) })
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Lock child exited before sending its result (${code})`)) })
  })
  return { child, result, exit }
}

test('a second instance in the same process cannot open the locked directory; release is idempotent', async () => fixture(async directory => {
  const release = await acquireDatabaseLock(directory)
  const metadata = JSON.parse(await readFile(lockPath(directory), 'utf8'))
  assert.equal(metadata.pid, process.pid)
  assert.equal(metadata.dataDir, directory)
  assert.equal(typeof metadata.hostname, 'string')
  assert.equal(typeof metadata.token, 'string')
  try { await assert.rejects(acquireDatabaseLock(directory), isCode('DB_IN_USE')) }
  finally { await Promise.all([release(), release()]) }
  const persistentFile = await stat(lockPath(directory))
  const replacement = await acquireDatabaseLock(directory)
  try {
    assert.equal((await stat(lockPath(directory))).ino, persistentFile.ino)
    assert.notEqual(JSON.parse(await readFile(lockPath(directory), 'utf8')).token, metadata.token)
    await release()
    await assert.rejects(acquireDatabaseLock(directory), isCode('DB_IN_USE'))
  } finally { await replacement() }
}))

test('realpath aliases share one OS lock', async () => fixture(async directory => {
  const release = await acquireDatabaseLock(directory)
  const alias = join(dirname(directory), 'alias')
  await symlink(directory, alias)
  try { await assert.rejects(acquireDatabaseLock(alias), isCode('DB_IN_USE')) }
  finally { await release() }
}))

test('stale diagnostic PID/host/token never block an unlocked file or authorize stealing a held one', async () => fixture(async directory => {
  await writeFile(lockPath(directory), JSON.stringify({ pid: 2_147_483_647, hostname: 'retired-host', token: 'stale-token' }))
  const release = await acquireDatabaseLock(directory)
  try {
    assert.equal(JSON.parse(await readFile(lockPath(directory), 'utf8')).pid, process.pid)
    await writeFile(lockPath(directory), JSON.stringify({ pid: 2_147_483_647, hostname: 'retired-host', token: 'stale-token' }))
    await assert.rejects(acquireDatabaseLock(directory), isCode('DB_IN_USE'))
  } finally { await release() }
}))

test('OS lock support is required and a failed acquisition leaves no held descriptor', async () => fixture(async directory => {
  await assert.rejects(acquireDatabaseLock(directory, { flockExecutable: 'knowbetter-flock-does-not-exist' }), isCode('DB_LOCK_UNAVAILABLE'))
  const release = await acquireDatabaseLock(directory)
  await release()
}))

test('the sibling lock cannot redirect writes through a symlink', async () => fixture(async directory => {
  const target = join(dirname(directory), 'unrelated')
  await writeFile(target, 'preserve this content')
  await symlink(target, lockPath(directory))
  await assert.rejects(acquireDatabaseLock(directory), isCode('DB_LOCK_UNAVAILABLE'))
  assert.equal(await readFile(target, 'utf8'), 'preserve this content')
}))

test('simultaneous independent processes elect exactly one owner', async () => fixture(async directory => {
  const contenders = await Promise.all(Array.from({ length: 6 }, () => contender(directory)))
  try {
    assert.equal(contenders.filter(entry => entry.result.ok).length, 1)
    assert.ok(contenders.filter(entry => !entry.result.ok).every(entry => !entry.result.ok && entry.result.code === 'DB_IN_USE'))
    await assert.rejects(acquireDatabaseLock(directory), isCode('DB_IN_USE'))
  } finally {
    for (const entry of contenders) if (entry.result.ok) entry.child.send('release')
    await Promise.all(contenders.map(entry => entry.exit))
  }
  const release = await acquireDatabaseLock(directory)
  await release()
}))

test('the kernel releases a dead owner without PID reclamation or deleting the sibling inode', async () => fixture(async directory => {
  const owner = await contender(directory)
  assert.equal(owner.result.ok, true)
  const before = await stat(lockPath(directory))
  await assert.rejects(acquireDatabaseLock(directory), isCode('DB_IN_USE'))
  owner.child.kill('SIGKILL')
  await owner.exit
  const release = await acquireDatabaseLock(directory)
  try {
    assert.equal((await stat(lockPath(directory))).ino, before.ino)
    assert.equal(JSON.parse(await readFile(lockPath(directory), 'utf8')).pid, process.pid)
  } finally { await release() }
}))
