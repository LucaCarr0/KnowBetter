import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createDatabase } from './database'
import { acquireDatabaseLock } from './database-lock'

test('SIGINT drains an accepted transaction, closes PGlite, releases the lock and preserves the committed record', { timeout: 10_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'knowbetter-shutdown-'))
  const dataDir = join(root, 'database')
  const logPath = join(root, 'shutdown.log')
  let child: ChildProcess | undefined
  let closed: Promise<unknown[]> | undefined
  let stderr = ''
  const messages: string[] = []
  try {
    const code = `
      const { EventEmitter } = require('node:events');
      const { createDatabase } = require(${JSON.stringify(join(process.cwd(), 'server/database.ts'))});
      const { createShutdown, registerShutdownSignals } = require(${JSON.stringify(join(process.cwd(), 'server/shutdown.ts'))});
      const send = (type) => new Promise((resolve, reject) => process.send({ type }, error => error ? reject(error) : resolve()));
      (async () => {
        const database = await createDatabase({ dataDir: process.argv[1] });
        await database.transaction(db => db.query('CREATE TABLE shutdown_probe (id integer PRIMARY KEY, value text NOT NULL)'));
        let pending;
        const close = createShutdown({
          http: new EventEmitter(),
          io: { async close() {} },
          nextApp: null,
          lobby: { drain: () => pending },
          database: { async close() { await database.close(); log('database-closed'); await send('database-closed'); } },
          stopTimer() {},
        });
        // Persist the logger calls because sandboxed child stdio can be
        // suppressed. Signals and process.exit still use the real runtime.
        const log = message => require('node:fs').appendFileSync(${JSON.stringify(logPath)}, message + '\\n');
        registerShutdownSignals(close, { timeoutMs: 8_000, logger: { warn: log, error: log } });
        // Keep the accepted transaction open until the parent actually sends
        // SIGINT, then delay briefly to prove shutdown must wait for its commit.
        const signaled = new Promise(resolve => process.once('SIGINT', () => {
          process.send({ type: 'signal-received' });
          setTimeout(resolve, 75);
        }));
        pending = database.transaction(async db => {
          await db.query('INSERT INTO shutdown_probe(id,value) VALUES(1,$1)', ['accepted']);
          await send('ready');
          await signaled;
          await db.query('UPDATE shutdown_probe SET value=$1 WHERE id=1', ['committed-before-close']);
        }).then(() => { log('transaction-committed'); return send('transaction-committed'); });
        await pending;
      })().catch(error => { console.error(error); process.exit(1); });
    `
    child = spawn(process.execPath, ['--import', 'tsx', '-e', code, dataDir], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    closed = once(child, 'close')
    child.stderr!.on('data', chunk => { stderr += String(chunk) })
    const ready = new Promise<void>((resolve, reject) => {
      child!.on('message', message => {
        const type = (message as { type?: string }).type
        if (type) messages.push(type)
        if (type === 'ready') resolve()
      })
      child!.once('error', reject)
      child!.once('close', code => reject(new Error(`Shutdown child exited before ready (${code}): ${stderr}`)))
    })
    await ready
    assert.deepEqual(messages, ['ready'])
    assert.equal(child.kill('SIGINT'), true)
    const [exitCode, signal] = await closed
    assert.equal(signal, null, stderr)
    assert.equal(exitCode, 0, stderr)
    assert.deepEqual(messages, ['ready', 'signal-received', 'transaction-committed', 'database-closed'])
    assert.deepEqual((await readFile(logPath, 'utf8')).trim().split('\n'), [
      'Shutting down Know Better…',
      'transaction-committed',
      'database-closed',
      'Chiusura completata: database chiuso.',
    ])

    // Reacquisition proves Ctrl+C released the OS lock. A real reopen checks
    // that both the in-flight commit and PGlite's shutdown checkpoint survived.
    const release = await acquireDatabaseLock(dataDir)
    await release()
    const reopened = await createDatabase({ dataDir })
    try {
      const result = await reopened.transaction(db => db.query<{ id: number; value: string }>('SELECT id,value FROM shutdown_probe'))
      assert.deepEqual(result.rows, [{ id: 1, value: 'committed-before-close' }])
    } finally { await reopened.close() }
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await closed?.catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})
