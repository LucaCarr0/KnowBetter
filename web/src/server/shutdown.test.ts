import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { Server } from 'node:http'
import type { Socket } from 'node:net'
import test from 'node:test'
import { createShutdown, registerShutdownSignals } from './shutdown'

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

class Connection extends EventEmitter {
  destroyed = false
  destroyCalls = 0
  constructor(private readonly onDestroy: () => void = () => {}) { super() }
  destroy() {
    this.destroyCalls += 1
    this.destroyed = true
    this.onDestroy()
    this.emit('close')
    return this
  }
}

function shutdownFixture(overrides: Partial<Parameters<typeof createShutdown>[0]> = {}) {
  const http = new EventEmitter()
  const calls: string[] = []
  const close = createShutdown({
    http: http as unknown as Pick<Server, 'on'>,
    io: { async close() { calls.push('io') } },
    nextApp: { async close() { calls.push('next') } },
    lobby: { async drain() { calls.push('drain') } },
    database: { async close() { calls.push('database') } },
    stopTimer() { calls.push('timer') },
    ...overrides,
  })
  const accept = (connection: Connection) => http.emit('connection', connection as unknown as Socket)
  return { close, calls, accept }
}

test('shutdown destroys unrelated upgraded sockets before awaiting HTTP shutdown', { timeout: 1_000 }, async () => {
  const ioFinished = deferred()
  const fixture = shutdownFixture({ io: { close() { fixture.calls.push('io'); return ioFinished.promise } } })
  // An HMR connection belongs to Next rather than Socket.IO. HTTP shutdown
  // cannot complete until that connection is destroyed by our shutdown code.
  const hmr = new Connection(ioFinished.resolve)
  fixture.accept(hmr)
  const first = fixture.close()
  const repeated = fixture.close()
  assert.equal(repeated, first)
  await first
  assert.equal(hmr.destroyed, true)
  assert.equal(hmr.destroyCalls, 1)
  assert.deepEqual(fixture.calls, ['timer', 'io', 'next', 'drain', 'database'])
})

test('connections accepted during shutdown are destroyed and closed connections are forgotten', async () => {
  const ioFinished = deferred()
  const fixture = shutdownFixture({ io: { close: () => ioFinished.promise } })
  const alreadyClosed = new Connection()
  fixture.accept(alreadyClosed)
  alreadyClosed.emit('close')
  const closing = fixture.close()
  const lateConnection = new Connection()
  fixture.accept(lateConnection)
  assert.equal(lateConnection.destroyed, true)
  assert.equal(alreadyClosed.destroyCalls, 0)
  ioFinished.resolve()
  await closing
})

test('cleanup continues after failures and reports every failure', async () => {
  const errors = [new Error('socket close failed'), new Error('Next close failed'), new Error('drain failed'), new Error('database close failed')]
  const calls: string[] = []
  const fixture = shutdownFixture({
    io: { async close() { calls.push('io'); throw errors[0] } },
    nextApp: { async close() { calls.push('next'); throw errors[1] } },
    lobby: { async drain() { calls.push('drain'); throw errors[2] } },
    database: { async close() { calls.push('database'); throw errors[3] } },
  })
  await assert.rejects(fixture.close(), (error: unknown) => {
    assert.ok(error instanceof AggregateError)
    assert.deepEqual(error.errors, errors)
    return true
  })
  assert.deepEqual(calls, ['io', 'next', 'drain', 'database'])
  await assert.rejects(fixture.close(), AggregateError)
  assert.equal(calls.length, 4)
})

test('shutdown without a Next app still drains pending work before closing the database', async () => {
  const drained = deferred()
  let databaseClosed = false
  const fixture = shutdownFixture({
    nextApp: null,
    lobby: { drain: () => drained.promise },
    database: { async close() { databaseClosed = true } },
  })
  const closing = fixture.close()
  await Promise.resolve()
  assert.equal(databaseClosed, false)
  drained.resolve()
  await closing
  assert.equal(databaseClosed, true)
})

function signalFixture(close: () => Promise<void>, timeoutMs = 1_000) {
  const runtime = Object.assign(new EventEmitter(), { exit: (code: number) => { exits.push(code) } })
  const exits: number[] = []
  const messages: unknown[][] = []
  const dispose = registerShutdownSignals(close, {
    runtime,
    timeoutMs,
    logger: { warn: (...args: unknown[]) => { messages.push(args) }, error: (...args: unknown[]) => { messages.push(args) } },
  })
  return { runtime, exits, messages, dispose }
}

async function flushPromises() {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

test('first shutdown signal waits for cleanup, then exits successfully once', async () => {
  const finished = deferred()
  let calls = 0
  const fixture = signalFixture(() => { calls += 1; return finished.promise })
  try {
    fixture.runtime.emit('SIGINT')
    await flushPromises()
    assert.equal(calls, 1)
    assert.deepEqual(fixture.exits, [])
    assert.equal(fixture.messages.some(message => message[0] === 'Chiusura completata: database chiuso.'), false)
    finished.resolve()
    await flushPromises()
    assert.deepEqual(fixture.exits, [0])
    assert.equal(fixture.messages.some(message => message[0] === 'Chiusura completata: database chiuso.'), true)
  } finally { fixture.dispose() }
})

test('a second shutdown signal forces termination instead of ignoring it', async () => {
  const finished = deferred()
  let calls = 0
  const fixture = signalFixture(() => { calls += 1; return finished.promise })
  try {
    fixture.runtime.emit('SIGINT')
    await flushPromises()
    fixture.runtime.emit('SIGTERM')
    assert.equal(calls, 1)
    assert.deepEqual(fixture.exits, [1])
  } finally { fixture.dispose() }
})

test('shutdown timeout forces termination when cleanup remains pending', async () => {
  const fixture = signalFixture(() => new Promise<void>(() => {}), 10)
  try {
    fixture.runtime.emit('SIGTERM')
    await new Promise<void>((resolve) => setTimeout(resolve, 30))
    assert.deepEqual(fixture.exits, [1])
    assert.ok(fixture.messages.length > 0)
  } finally { fixture.dispose() }
})

test('failed cleanup exits with an error and disposing removes signal handlers', async () => {
  const fixture = signalFixture(async () => { throw new Error('cleanup failed') })
  try {
    fixture.runtime.emit('SIGTERM')
    await flushPromises()
    assert.deepEqual(fixture.exits, [1])
    assert.ok(fixture.messages.length > 0)
  } finally { fixture.dispose() }
  assert.equal(fixture.runtime.listenerCount('SIGINT'), 0)
  assert.equal(fixture.runtime.listenerCount('SIGTERM'), 0)
})
