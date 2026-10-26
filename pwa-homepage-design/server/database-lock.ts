import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, realpath, type FileHandle } from 'node:fs/promises'
import { hostname } from 'node:os'
import { basename, dirname, join } from 'node:path'

export class DatabaseLockError extends Error {
  constructor(public readonly code: 'DB_IN_USE' | 'DB_LOCK_UNAVAILABLE', message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DatabaseLockError'
  }
}

export interface DatabaseLockOptions {
  /** Injection point for testing unavailable OS support; defaults to util-linux flock. */
  flockExecutable?: string
}

interface LockOwner { pid: number; hostname: string; token: string; startedAt: string; dataDir: string }

// Retain every live descriptor even if a caller accidentally loses its release
// callback. Only explicit release or process termination should drop a lock.
const heldLocks = new Map<string, FileHandle>()
const CONFLICT_EXIT_CODE = 73

async function tryFlock(handle: FileHandle, executable: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Passing the existing descriptor shares its open file description. flock's
    // lock survives this short-lived child because the parent still owns the FD.
    // See https://man7.org/linux/man-pages/man2/flock.2.html (fork/dup semantics).
    const child = spawn(executable, ['--exclusive', '--nonblock', '--conflict-exit-code', `${CONFLICT_EXIT_CODE}`, '3'], {
      stdio: ['ignore', 'ignore', 'pipe', handle.fd],
      windowsHide: true,
    })
    let stderr = ''
    child.stderr?.on('data', chunk => { if (stderr.length < 2048) stderr += String(chunk).slice(0, 2048 - stderr.length) })
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    child.once('error', error => {
      clearTimeout(timer)
      reject(new DatabaseLockError('DB_LOCK_UNAVAILABLE', 'Impossibile proteggere il database locale: serve il comando flock di util-linux. Installa util-linux oppure configura DATABASE_URL per PostgreSQL.', { cause: error }))
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(true)
      else if (code === CONFLICT_EXIT_CODE) resolve(false)
      else reject(new DatabaseLockError('DB_LOCK_UNAVAILABLE', `Il sistema non ha potuto acquisire il blocco del database locale (${signal ?? code ?? 'errore'}). ${stderr.trim()}`.trim()))
    })
  })
}

async function ownerDescription(handle: FileHandle): Promise<string> {
  try {
    const buffer = Buffer.alloc(4096)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const owner = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) as Partial<LockOwner>
    if (Number.isSafeInteger(owner.pid) && typeof owner.hostname === 'string') return ` PID ${owner.pid} su ${owner.hostname}.`
  } catch { /* A missing/partial diagnostic record never weakens the kernel lock. */ }
  return ''
}

/**
 * Hold an OS lock until the returned release callback runs, after PGlite closes.
 * The sibling file intentionally persists: unlink/rename could let two callers
 * lock different inodes. Stale metadata is harmless; the kernel releases locks
 * when a process dies, so no PID guessing or racy stale-file reclamation occurs.
 * All application paths opening this data directory must use this helper.
 */
export async function acquireDatabaseLock(dataDir: string, options: DatabaseLockOptions = {}): Promise<() => Promise<void>> {
  if (process.platform !== 'linux') throw new DatabaseLockError('DB_LOCK_UNAVAILABLE', 'Il database locale protetto richiede Linux con flock di util-linux. Su questa piattaforma configura DATABASE_URL per PostgreSQL.')
  await mkdir(dataDir, { recursive: true })
  const canonical = await realpath(dataDir)
  const lockPath = join(dirname(canonical), `.${basename(canonical)}.lock`)
  let handle: FileHandle
  try {
    // Never follow a sibling symlink or truncate before obtaining the OS lock.
    handle = await open(lockPath, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600)
  } catch (error) {
    throw new DatabaseLockError('DB_LOCK_UNAVAILABLE', `Impossibile aprire in sicurezza il blocco del database: ${lockPath}`, { cause: error })
  }
  const token = randomUUID()
  try {
    if (!(await handle.stat()).isFile()) throw new DatabaseLockError('DB_LOCK_UNAVAILABLE', `Il percorso del blocco non è un file regolare: ${lockPath}`)
    if (!(await tryFlock(handle, options.flockExecutable ?? 'flock'))) {
      const owner = await ownerDescription(handle)
      throw new DatabaseLockError('DB_IN_USE', `Il database locale è già in uso da un altro processo.${owner} Chiudi l’altro coordinatore o comando di importazione prima di riprovare. Directory: ${canonical}`)
    }
    const owner: LockOwner = { pid: process.pid, hostname: hostname(), token, startedAt: new Date().toISOString(), dataDir: canonical }
    await handle.truncate(0)
    await handle.writeFile(`${JSON.stringify(owner)}\n`, 'utf8')
    await handle.sync()
    heldLocks.set(token, handle)
  } catch (error) {
    await handle.close()
    throw error
  }
  let releasing: Promise<void> | undefined
  return () => {
    releasing ??= handle.close().then(() => { heldLocks.delete(token) })
    return releasing
  }
}
