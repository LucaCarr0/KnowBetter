import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getBonusCatalog } from '../content/bonus-catalog'
import { BET_MS, GATE_MS, OUTRO_MS, betPayout } from '../../features/game/marble-race'
import { SLICE_DEGREES, WHEEL_SLICES, sliceAtAngle, spinAngle, spinTrajectory, turnsPerPlayer, type MinigameView, type WheelSliceKind } from '../../features/game/wheel'
import { advance, continueGame, createGame, devSkip, recoverGame, retire, snapshot, type GameContent, type GameState, type TriviaQuestion } from './engine'
import { MINIGAMES } from './minigames'
import { applySpin, confirmMinigame, flashAnswer, minigameAction, spin } from './wheel'

const content: GameContent = {
  categories: ['a', 'b', 'c'].map(id => ({ id, name: id })),
  bonusQuestions: getBonusCatalog().questions,
  questions: ['a', 'b', 'c'].flatMap(categoryId => Array.from({ length: 40 }, (_, index): TriviaQuestion => ({
    id: `${categoryId}-${index}`, categoryId, prompt: `Domanda ${categoryId} ${index}`,
    options: ['w', 'x', 'y', 'z'].map(id => ({ id, text: `Opzione ${id}` })), correctOptionId: 'w',
    difficulty: 'easy', language: 'it', sourceName: 'Fixture', sourceUrl: 'https://example.test', license: 'CC0', sourceId: `${index}`,
  }))),
}
const sliceOf = (kind: WheelSliceKind) => WHEEL_SLICES.indexOf(kind)
const ids = (count: number) => Array.from({ length: count }, (_, index) => `p${index}`)

function wheelGame(count: number): { game: GameState; connected: Set<string>; now: number } {
  const players = ids(count).map(id => ({ id, nickname: id, avatarId: 'panda' as const }))
  const game = createGame(players, content, 1_000)
  game.phase = 'phase1_summary'
  game.opensAt = 1_000
  game.deadline = null
  game.round = 5
  const connected = new Set(ids(count))
  continueGame(game, 'p0', content, connected, 5, 'phase1_summary', 2_000)
  continueGame(game, 'p0', content, connected, 5, 'wheel_intro', 3_000)
  return { game, connected, now: 3_000 }
}

/** Puts the game on the given slice and fast-forwards past the animation. */
function land(game: GameState, connected: Set<string>, kind: WheelSliceKind, now: number): number {
  assert.equal(game.phase, 'wheel_turn')
  applySpin(game, 0, now, false, sliceOf(kind))
  const after = game.deadline!
  advance(game, content, connected, after)
  return after
}

function play(game: GameState, connected: Set<string>, now: number): number {
  const run = game.wheel!.minigame!
  for (const id of connected) confirmMinigame(game, id, run.runId)
  advance(game, content, connected, now)
  assert.equal(game.phase, 'minigame_playing')
  return now
}

test('the wheel has 40 slices in the confirmed proportions, spread around the rim', () => {
  const counts: Record<string, number> = {}
  for (const slice of WHEEL_SLICES) counts[slice] = (counts[slice] ?? 0) + 1
  assert.deepEqual(counts, { minigame: 17, flash_all: 2, flash_self: 3, plus: 9, minus: 7, double: 1, half: 1 })
  const positions = (kind: WheelSliceKind) => WHEEL_SLICES.flatMap((slice, index) => slice === kind ? [index] : [])
  const gaps = positions('plus').map((position, index, all) => (all[(index + 1) % all.length] - position + 40) % 40)
  assert.ok(Math.max(...gaps) <= 7, `+500 raggruppati: ${gaps}`)
  assert.equal(positions('minigame').filter((position, index, all) => all[index + 1] === position + 1 && all[index + 2] === position + 2 && all[index + 3] === position + 3).length, 0)
})

test('spins per player follow the owner rule for 2 to 10 players', () => {
  const expected = [4, 3, 2, 2, 2, 2, 1, 1, 1]
  for (let players = 2; players <= 10; players++) {
    assert.equal(turnsPerPlayer(players), expected[players - 2])
    const { game } = wheelGame(players)
    const total = game.wheel!.schedule.length
    assert.ok(total >= 8 && total <= 16, `${players}: ${total}`)
    assert.equal(total, players * turnsPerPlayer(players))
    for (const id of ids(players)) assert.equal(game.wheel!.schedule.filter(entry => entry === id).length, turnsPerPlayer(players))
  }
})

test('the trajectory is a pure function of the clock and always lands on the drawn slice', () => {
  for (let index = 0; index < WHEEL_SLICES.length; index++) {
    for (const strength of [0, .5, 1, -.5, -1]) {
      for (const offset of [-1, 0, 1]) {
        const trajectory = spinTrajectory(index, strength, 1_000, offset)
        assert.equal(sliceAtAngle(spinAngle(trajectory, 1_000 + trajectory.durationMs)), index)
        assert.equal(spinAngle(trajectory, 1_500), spinAngle({ ...trajectory }, 1_500))
      }
    }
  }
  assert.equal(spinAngle(spinTrajectory(3, 1, 0), -50), 0)
  const weak = spinTrajectory(3, 0, 0)
  const strong = spinTrajectory(3, 1, 0)
  assert.ok(strong.durationMs > weak.durationMs && strong.finalAngle > weak.finalAngle)
  assert.equal(weak.durationMs, 3_000)
  assert.equal(strong.durationMs, 6_000)
  assert.ok(SLICE_DEGREES === 9)
})

test('only the turn owner can spin, and the swipe strength is bounded', () => {
  const { game } = wheelGame(4)
  const spinner = game.wheel!.schedule[0]
  const other = ids(4).find(id => id !== spinner)!
  assert.throws(() => spin(game, other, game.wheel!.turnId, 1, 3_100), { code: 'NOT_YOUR_TURN' })
  assert.throws(() => spin(game, spinner, 'stale', 1, 3_100), { code: 'STALE_TURN' })
  const turnId = game.wheel!.turnId
  spin(game, spinner, turnId, 2, 3_100)
  assert.equal(game.phase, 'wheel_spin')
  assert.equal(game.wheel!.spin!.trajectory.durationMs, 6_000, 'la forza è limitata a 1')
  assert.throws(() => spin(game, spinner, turnId, 1, 3_200), { code: 'STALE_TURN' })
})

test('effects hit the spinner at the limits and are hidden until the wheel stops', () => {
  const cases: [WheelSliceKind, number, number][] = [['plus', 300, 800], ['minus', 300, 0], ['minus', 900, 400], ['double', 0, 0], ['double', 450, 900], ['half', 901, 450]]
  for (const [kind, before, after] of cases) {
    const { game, connected, now } = wheelGame(4)
    const spinner = game.players.find(player => player.id === game.wheel!.schedule[0])!
    spinner.points = before
    const others = game.players.filter(player => player !== spinner).map(player => player.points)
    applySpin(game, 0, now, false, sliceOf(kind))
    assert.equal(spinner.points, after, kind)
    assert.deepEqual(game.players.filter(player => player !== spinner).map(player => player.points), others)
    const during = snapshot(game, 'p0', connected, now + 100)
    assert.equal(during.players.find(player => player.id === spinner.id)!.points, before, 'nessuno spoiler durante la rotazione')
    const stopped = game.deadline!
    assert.ok(stopped > now + game.wheel!.spin!.trajectory.durationMs, 'la ruota ferma resta visibile')
    advance(game, content, connected, stopped)
    assert.equal(game.phase, 'wheel_effect', 'il bonus non fa rigirare')
    assert.equal(snapshot(game, 'p0', connected, stopped).players.find(player => player.id === spinner.id)!.points, after)
    advance(game, content, connected, stopped + 5_000)
    assert.equal(game.phase, 'wheel_turn')
    assert.equal(game.wheel!.cursor, 1)
  }
})

test('an idle or disconnected spinner gets an automatic spin', () => {
  const { game, connected, now } = wheelGame(4)
  advance(game, content, connected, now + 14_999)
  assert.equal(game.phase, 'wheel_turn')
  advance(game, content, connected, now + 15_000)
  assert.equal(game.phase, 'wheel_spin')
  assert.equal(game.wheel!.spin!.auto, true)

  const away = wheelGame(4)
  const spinner = away.game.wheel!.schedule[0]
  const partial = new Set(ids(4).filter(id => id !== spinner))
  advance(away.game, content, partial, away.now + 2_999)
  assert.equal(away.game.phase, 'wheel_turn')
  advance(away.game, content, partial, away.now + 3_000)
  assert.equal(away.game.phase, 'wheel_spin')

  const alone = wheelGame(2)
  advance(alone.game, content, new Set(['p0']), alone.now + 1)
  assert.equal(alone.game.phase, 'suspended')
  advance(alone.game, content, alone.connected, alone.now + 2)
  assert.equal(alone.game.phase, 'wheel_turn')
})

test('retired players lose their turns and the wheel stops below two players', () => {
  const { game, connected, now } = wheelGame(4)
  const second = game.wheel!.schedule[1]
  let time = land(game, connected, 'plus', now)
  retire(game, second, time)
  connected.delete(second)
  advance(game, content, connected, time += 5_000)
  assert.equal(game.phase, 'wheel_turn')
  assert.notEqual(game.wheel!.schedule[game.wheel!.cursor], second)
  assert.equal(game.wheel!.cursor, 2)

  const pair = wheelGame(2)
  retire(pair.game, 'p1', pair.now)
  advance(pair.game, content, new Set(['p0']), pair.now + 1)
  assert.equal(pair.game.phase, 'aborted')
})

test('the preview waits for every connected player, with a safety deadline', () => {
  const { game, connected, now } = wheelGame(4)
  let time = land(game, connected, 'minigame', now)
  assert.equal(game.phase, 'minigame_intro')
  const run = game.wheel!.minigame!
  confirmMinigame(game, 'p0', run.runId)
  confirmMinigame(game, 'p0', run.runId)
  assert.deepEqual(run.confirmedIds, ['p0'])
  confirmMinigame(game, 'p1', run.runId)
  confirmMinigame(game, 'p2', run.runId)
  advance(game, content, connected, time + 1)
  assert.equal(game.phase, 'minigame_intro')
  advance(game, content, new Set(['p0', 'p1', 'p2']), time + 2)
  assert.equal(game.phase, 'minigame_playing', 'chi si disconnette non blocca il gruppo')
  assert.throws(() => confirmMinigame(game, 'p3', run.runId), { code: 'STALE_MINIGAME' })

  const lazy = wheelGame(4)
  time = land(lazy.game, lazy.connected, 'minigame', lazy.now)
  advance(lazy.game, content, lazy.connected, time + 44_999)
  assert.equal(lazy.game.phase, 'minigame_intro')
  advance(lazy.game, content, lazy.connected, time + 45_000)
  assert.equal(lazy.game.phase, 'minigame_playing')
})

test('minigames are drawn without repeats and two players never get three-player games', () => {
  const { game, connected, now } = wheelGame(4)
  const drawn: string[] = []
  let time = now
  for (let index = 0; index < 6; index++) {
    game.wheel!.cursor = 0
    time = land(game, connected, 'minigame', time)
    drawn.push(game.wheel!.minigame!.kind)
    game.phase = 'wheel_effect'
    game.deadline = time
    advance(game, content, connected, time)
  }
  assert.equal(new Set(drawn).size, 6)

  const pair = wheelGame(2)
  time = pair.now
  for (let index = 0; index < 8; index++) {
    pair.game.wheel!.cursor = 0
    time = land(pair.game, pair.connected, 'minigame', time)
    assert.ok(MINIGAMES[pair.game.wheel!.minigame!.kind].minPlayers <= 2)
    pair.game.phase = 'wheel_effect'
    pair.game.deadline = time
    advance(pair.game, content, pair.connected, time)
  }
})

function startKind(kind: keyof typeof MINIGAMES, players = 4) {
  const setup = wheelGame(players)
  setup.game.wheel!.bag = [kind]
  const time = play(setup.game, setup.connected, land(setup.game, setup.connected, 'minigame', setup.now))
  assert.equal(setup.game.wheel!.minigame!.kind, kind)
  return { ...setup, time, run: setup.game.wheel!.minigame! }
}

const act = (setup: ReturnType<typeof startKind>, playerId: string, action: Record<string, unknown>, at = setup.time + 1_000) =>
  minigameAction(setup.game, playerId, setup.run.runId, `${playerId}-${Math.random()}`, action, setup.connected, at)
const finishedRows = (setup: ReturnType<typeof startKind>, at = setup.time + 1_000) => {
  advance(setup.game, content, setup.connected, at)
  assert.equal(setup.game.phase, 'minigame_results')
  return setup.game.wheel!.minigame!.results!
}

test('Stoppa il timer ranks by precision and rejects impossible times', () => {
  const setup = startKind('timer')
  const target = (setup.run.state as { targetMs: number }).targetMs
  const at = setup.time + 15_000
  assert.throws(() => act(setup, 'p0', { type: 'stop', elapsedMs: 99_000 }, at), { code: 'INVALID_MINIGAME_ACTION' })
  assert.throws(() => act(setup, 'p0', { type: 'stop', elapsedMs: -1 }, at), { code: 'INVALID_MINIGAME_ACTION' })
  act(setup, 'p0', { type: 'stop', elapsedMs: target + 100 }, at)
  assert.throws(() => act(setup, 'p0', { type: 'stop', elapsedMs: target }, at), { code: 'MINIGAME_ALREADY_PLAYED' })
  act(setup, 'p1', { type: 'stop', elapsedMs: target - 100 }, at)
  act(setup, 'p2', { type: 'stop', elapsedMs: target + 500 }, at)
  const rows = finishedRows(setup, setup.time + 20_000)
  assert.deepEqual(rows.map(row => [row.playerId, row.rank, row.points]), [['p0', 1, 1000], ['p1', 1, 1000], ['p2', 3, 467], ['p3', 4, 0]])
  assert.equal(setup.game.players.find(player => player.id === 'p2')!.points, 467)
})

test('Numeri in ordine uses the server finish time and ends when all have finished', () => {
  const setup = startKind('numbers', 2)
  assert.deepEqual([...(setup.run.state as { grid: number[] }).grid].sort((a, b) => a - b), Array.from({ length: 16 }, (_, index) => index + 1))
  act(setup, 'p1', { type: 'finish' }, setup.time + 8_000)
  act(setup, 'p0', { type: 'finish' }, setup.time + 9_000)
  const rows = finishedRows(setup, setup.time + 9_000)
  assert.deepEqual(rows.map(row => [row.playerId, row.points, row.detail]), [['p1', 1000, 8_000], ['p0', 200, 9_000]])
})

test('Palloncino pops past the secret limit, which stays private until the end', () => {
  const setup = startKind('balloon', 3)
  const state = setup.run.state as { limit: number }
  state.limit = 10
  const at = setup.time + 5_000
  act(setup, 'p0', { type: 'pump', count: 10 }, at)
  act(setup, 'p1', { type: 'pump', count: 11 }, at)
  assert.throws(() => act(setup, 'p1', { type: 'pump', count: 1 }, at), { code: 'MINIGAME_ALREADY_PLAYED' })
  assert.throws(() => act(setup, 'p2', { type: 'cash' }, at), { code: 'INVALID_MINIGAME_ACTION' })
  assert.throws(() => act(setup, 'p2', { type: 'pump', count: 500 }, at), { code: 'INVALID_MINIGAME_ACTION' })
  const during = snapshot(setup.game, 'p2', setup.connected, at)
  assert.ok(!JSON.stringify(during.wheel).includes('"limit"'))
  assert.equal(during.wheel!.minigame!.revealValue, null)
  const rows = finishedRows(setup, setup.time + 15_000)
  assert.deepEqual(rows.map(row => [row.playerId, row.points]), [['p0', 1000], ['p1', 600], ['p2', 0]])
  assert.equal(snapshot(setup.game, 'p2', setup.connected, setup.time + 15_000).wheel!.minigame!.revealValue, 10)
})

test('Palloncino ranks by closeness to the limit when time runs out', () => {
  const setup = startKind('balloon')
  ;(setup.run.state as { limit: number }).limit = 30
  const at = setup.time + 5_000
  act(setup, 'p0', { type: 'pump', count: 12 }, at)
  act(setup, 'p1', { type: 'pump', count: 8 }, at)
  act(setup, 'p2', { type: 'pump', count: 8 }, at)
  act(setup, 'p3', { type: 'pump', count: 3 }, at)
  advance(setup.game, content, setup.connected, at)
  assert.equal(setup.game.phase, 'minigame_playing', 'si gioca fino allo scadere del tempo')
  assert.deepEqual(finishedRows(setup, setup.time + 15_000).map(row => [row.playerId, row.rank, row.points, row.detail]), [['p0', 1, 1000, 12], ['p1', 2, 733, 8], ['p2', 2, 733, 8], ['p3', 4, 200, 3]])
})

test('Palloncino ranks popped balloons last and ends early only when all have popped', () => {
  const setup = startKind('balloon')
  ;(setup.run.state as { limit: number }).limit = 20
  const at = setup.time + 5_000
  act(setup, 'p0', { type: 'pump', count: 20 }, at + 2_000)
  act(setup, 'p0', { type: 'pump', count: 1 }, at + 4_000)
  act(setup, 'p1', { type: 'pump', count: 4 }, at)
  act(setup, 'p2', { type: 'pump', count: 9 }, at)
  const rows = finishedRows(setup, setup.time + 15_000)
  assert.deepEqual(rows.map(row => [row.playerId, row.rank, row.points]), [['p2', 1, 1000], ['p1', 2, 733], ['p0', 3, 467], ['p3', 4, 0]])

  const popped = startKind('balloon', 2)
  ;(popped.run.state as { limit: number }).limit = 2
  for (const id of ['p0', 'p1']) act(popped, id, { type: 'pump', count: 3 }, popped.time + 1_000)
  assert.equal(finishedRows(popped, popped.time + 1_000).every(row => row.rank === 1 && row.points === 1000), true)
})

test('Palloncino caps the pump rate against scripted batches', () => {
  const setup = startKind('balloon', 2)
  ;(setup.run.state as { limit: number }).limit = 30
  act(setup, 'p0', { type: 'pump', count: 20 }, setup.time)
  const entry = (setup.run.state as { entries: Record<string, { pumps: number }> }).entries.p0
  assert.equal(entry.pumps, 2)
})

test('Dividi il bottino splits each chest among those who picked it, hidden until the end', () => {
  const setup = startKind('chests')
  act(setup, 'p0', { type: 'pick', value: 0 })
  assert.equal(JSON.stringify(snapshot(setup.game, 'p1', setup.connected, setup.time + 1).wheel).includes('"selfPick":0'), false)
  act(setup, 'p1', { type: 'pick', value: 0 })
  act(setup, 'p2', { type: 'pick', value: 1 })
  assert.throws(() => act(setup, 'p3', { type: 'pick', value: 3 }), { code: 'INVALID_MINIGAME_ACTION' })
  act(setup, 'p3', { type: 'pick', value: 2 })
  const rows = finishedRows(setup)
  assert.deepEqual(Object.fromEntries(rows.map(row => [row.playerId, row.points])), { p0: 750, p1: 750, p2: 800, p3: 300 })
})

test('Il più alto unico rewards the highest unshared number, or nobody', () => {
  const setup = startKind('highest')
  for (const [id, value] of [['p0', 20], ['p1', 20], ['p2', 7], ['p3', 3]] as const) act(setup, id, { type: 'pick', value })
  assert.deepEqual(Object.fromEntries(finishedRows(setup).map(row => [row.playerId, row.points])), { p0: 0, p1: 0, p2: 1000, p3: 0 })

  const none = startKind('highest', 3)
  for (const id of ['p0', 'p1', 'p2']) act(none, id, { type: 'pick', value: 5 })
  assert.ok(finishedRows(none).every(row => row.points === 0))
})

test('Bomba passes, explodes on schedule, clamps at zero and hides its timers', () => {
  const setup = startKind('bomb')
  const state = setup.run.state as { holderId: string; blockedId: string | null; blastOffsets: number[]; hits: Record<string, number> }
  state.holderId = 'p0'
  state.blastOffsets = [5_000, 12_000, 19_000]
  assert.ok(!JSON.stringify(snapshot(setup.game, 'p1', setup.connected, setup.time + 1).wheel).includes('blastOffsets'))
  assert.throws(() => act(setup, 'p1', { type: 'pass', targetId: 'p2' }), { code: 'BOMB_NOT_HELD' })
  assert.throws(() => act(setup, 'p0', { type: 'pass', targetId: 'p0' }), { code: 'BOMB_INVALID_TARGET' })
  act(setup, 'p0', { type: 'pass', targetId: 'p1' })
  assert.throws(() => act(setup, 'p1', { type: 'pass', targetId: 'p0' }), { code: 'BOMB_INVALID_TARGET' })
  advance(setup.game, content, setup.connected, setup.time + 5_000)
  assert.equal(state.hits.p1, 1)
  assert.equal(state.blockedId, null)
  state.holderId = 'p1'
  setup.game.players.find(player => player.id === 'p1')!.points = 100
  setup.game.players.find(player => player.id === 'p2')!.points = 1000
  advance(setup.game, content, setup.connected, setup.time + 12_000)
  state.holderId = 'p2'
  advance(setup.game, content, setup.connected, setup.time + 19_000)
  assert.equal(setup.game.phase, 'minigame_results')
  const rows = setup.game.wheel!.minigame!.results!
  const row = (id: string) => rows.find(entry => entry.playerId === id)!
  assert.equal(row('p1').points, -100, 'non scende sotto zero e mostra la perdita reale')
  assert.equal(setup.game.players.find(player => player.id === 'p1')!.points, 0)
  assert.equal(row('p2').points, -300)
  assert.equal(row('p0').points, 300)
  assert.equal(row('p3').points, 300)
})

test('Bomba moves away from a disconnected holder', () => {
  const setup = startKind('bomb')
  const state = setup.run.state as { holderId: string }
  state.holderId = 'p0'
  const online = new Set(['p1', 'p2', 'p3'])
  advance(setup.game, content, online, setup.time + 100)
  assert.ok(online.has(state.holderId))
})

test('Rubapunti steals with cooldowns, shields stun the thief and ranks by final pot', () => {
  const setup = startKind('steal')
  const pots = () => (snapshot(setup.game, 'p0', setup.connected, setup.time).wheel!.minigame!.view as { pots: Record<string, number> }).pots
  act(setup, 'p0', { type: 'steal', targetId: 'p1' }, setup.time + 1_000)
  assert.deepEqual([pots().p0, pots().p1], [600, 400])
  act(setup, 'p0', { type: 'steal', targetId: 'p1' }, setup.time + 2_000)
  assert.equal(pots().p0, 600, 'in ricarica')
  assert.throws(() => act(setup, 'p0', { type: 'steal', targetId: 'p0' }), { code: 'INVALID_MINIGAME_ACTION' })
  act(setup, 'p1', { type: 'shield' }, setup.time + 3_000)
  act(setup, 'p0', { type: 'steal', targetId: 'p1' }, setup.time + 3_500)
  assert.deepEqual([pots().p0, pots().p1], [600, 400], 'lo scudo respinge')
  act(setup, 'p0', { type: 'steal', targetId: 'p2' }, setup.time + 5_400)
  assert.equal(pots().p2, 500, 'il ladro resta bloccato per 2 secondi')
  act(setup, 'p0', { type: 'steal', targetId: 'p2' }, setup.time + 5_600)
  assert.equal(pots().p2, 400)
  const rows = finishedRows(setup, setup.time + 20_000)
  assert.deepEqual(rows.map(row => [row.playerId, row.rank, row.points]), [['p0', 1, 1000], ['p1', 2, 733], ['p2', 3, 0], ['p3', 3, 0]])
})

test('Duello a sorpresa ranks inside each group, punishes early shots and makes a trio when odd', () => {
  const setup = startKind('duel', 5)
  const state = setup.run.state as { signalOffsetMs: number; groups: string[][] }
  assert.deepEqual(state.groups.map(group => group.length).sort(), [2, 3])
  state.groups = [['p0', 'p1'], ['p2', 'p3', 'p4']]
  state.signalOffsetMs = 5_000
  assert.equal((snapshot(setup.game, 'p0', setup.connected, setup.time).wheel!.minigame!.view as { opponentIds: string[] }).opponentIds[0], 'p1')
  assert.throws(() => act(setup, 'p2', { type: 'shoot', reactionMs: 100 }, setup.time + 2_000), { code: 'INVALID_MINIGAME_ACTION' })
  assert.throws(() => act(setup, 'p2', { type: 'shoot', reactionMs: 9_000 }, setup.time + 5_500), { code: 'INVALID_MINIGAME_ACTION' })
  act(setup, 'p0', { type: 'early' }, setup.time + 1_000)
  assert.throws(() => act(setup, 'p0', { type: 'shoot', reactionMs: 100 }, setup.time + 5_500), { code: 'MINIGAME_ALREADY_PLAYED' })
  act(setup, 'p1', { type: 'shoot', reactionMs: 400 }, setup.time + 5_500)
  act(setup, 'p2', { type: 'shoot', reactionMs: 300 }, setup.time + 5_500)
  act(setup, 'p3', { type: 'shoot', reactionMs: 250 }, setup.time + 5_500)
  act(setup, 'p4', { type: 'shoot', reactionMs: 500.4 }, setup.time + 5_600)
  const rows = finishedRows(setup, setup.time + 5_600)
  assert.deepEqual(Object.fromEntries(rows.map(row => [row.playerId, row.points])), { p0: 0, p1: 1000, p2: 600, p3: 1000, p4: 200 })
  assert.equal(rows.find(row => row.playerId === 'p4')!.detail, 500)
})

test('Tiro alla fune weighs the smaller team and pays only those who pulled', () => {
  const setup = startKind('tug', 3)
  const state = setup.run.state as { teams: string[][] }
  assert.deepEqual(state.teams.map(team => team.length), [2, 1])
  state.teams = [['p0', 'p1'], ['p2']]
  const at = setup.time + 5_000
  act(setup, 'p0', { type: 'tug', count: 10 }, at)
  act(setup, 'p2', { type: 'tug', count: 6 }, at)
  assert.throws(() => act(setup, 'p2', { type: 'tug', count: 500 }, at), { code: 'INVALID_MINIGAME_ACTION' })
  assert.deepEqual((snapshot(setup.game, 'p0', setup.connected, at).wheel!.minigame!.view as { scores: number[] }).scores, [10, 12])
  assert.deepEqual(Object.fromEntries(finishedRows(setup, setup.time + 15_000).map(row => [row.playerId, row.points])), { p0: 200, p1: 0, p2: 1000 })

  const tie = startKind('tug', 2)
  ;(tie.run.state as { teams: string[][] }).teams = [['p0'], ['p1']]
  for (const id of ['p0', 'p1']) act(tie, id, { type: 'tug', count: 5 }, tie.time + 5_000)
  assert.ok(finishedRows(tie, tie.time + 15_000).every(row => row.points === 600))
})

test('Dividi o rubi pays by the pair of hidden choices, and Jerry takes the odd seat', () => {
  const setup = startKind('split')
  ;(setup.run.state as { pairs: string[][] }).pairs = [['p0', 'p1'], ['p2', 'p3']]
  act(setup, 'p0', { type: 'pick', value: 'steal' })
  assert.ok(!JSON.stringify(snapshot(setup.game, 'p1', setup.connected, setup.time).wheel!.minigame!.view).includes('steal'))
  assert.throws(() => act(setup, 'p0', { type: 'pick', value: 'split' }), { code: 'MINIGAME_ALREADY_PLAYED' })
  assert.throws(() => act(setup, 'p1', { type: 'pick', value: 'cash' }), { code: 'INVALID_MINIGAME_ACTION' })
  act(setup, 'p1', { type: 'pick', value: 'split' })
  act(setup, 'p2', { type: 'pick', value: 'split' })
  act(setup, 'p3', { type: 'pick', value: 'split' })
  assert.deepEqual(Object.fromEntries(finishedRows(setup).map(row => [row.playerId, row.points])), { p0: 1000, p1: 0, p2: 500, p3: 500 })

  const both = startKind('split', 2)
  for (const id of ['p0', 'p1']) act(both, id, { type: 'pick', value: 'steal' })
  assert.ok(finishedRows(both).every(row => row.points === 0))

  const absent = startKind('split', 2)
  act(absent, 'p0', { type: 'pick', value: 'steal' })
  assert.deepEqual(Object.fromEntries(finishedRows(absent, absent.time + 12_000).map(row => [row.playerId, row.points])), { p0: 1000, p1: 0 })

  const odd = startKind('split', 3)
  const state = odd.run.state as { pairs: string[][]; picks: Record<string, string> }
  assert.ok(state.pairs.some(pair => pair.includes('jerry')))
  state.picks.jerry = 'split'
  const solo = state.pairs.find(pair => pair.includes('jerry'))!.find(id => id !== 'jerry')!
  assert.equal((snapshot(odd.game, solo, odd.connected, odd.time).wheel!.minigame!.view as { opponentId: string | null }).opponentId, null)
  for (const id of ids(3)) act(odd, id, { type: 'pick', value: id === solo ? 'steal' : 'split' })
  const rows = finishedRows(odd)
  assert.equal(rows.length, 3)
  assert.equal(rows.find(row => row.playerId === solo)!.points, 1000)
})

const betView = (setup: ReturnType<typeof startKind>, playerId: string, at = setup.time) =>
  snapshot(setup.game, playerId, setup.connected, at).wheel!.minigame!.view as Extract<MinigameView, { kind: 'bet' }>

test('Crazy Bet takes one bet per player within the stake, and keeps lanes and bets hidden until the close', () => {
  const setup = startKind('bet')
  setup.game.players.forEach((player, index) => { player.points = [3_000, 0, 1_000, 100][index] })
  for (const [playerId, action] of [
    ['p0', { type: 'bet', marbleId: 'nobody', amount: 100 }], ['p0', { type: 'bet', marbleId: 'p1', amount: 49 }],
    ['p0', { type: 'bet', marbleId: 'p1', amount: 3_001 }], ['p0', { type: 'bet', marbleId: 'p1', amount: 100.5 }],
    ['p1', { type: 'bet', marbleId: 'p2', amount: 201 }], ['p0', { type: 'pick', marbleId: 'p1', amount: 100 }],
  ] as const) assert.throws(() => act(setup, playerId, action), { code: 'INVALID_MINIGAME_ACTION' })
  act(setup, 'p0', { type: 'bet', marbleId: 'p0', amount: 3_000 })
  assert.throws(() => act(setup, 'p0', { type: 'bet', marbleId: 'p1', amount: 100 }), { code: 'MINIGAME_ALREADY_PLAYED' })
  act(setup, 'p1', { type: 'bet', marbleId: 'p2', amount: 200 })
  act(setup, 'p2', { type: 'bet', marbleId: 'p3', amount: 1_000 })

  const open = betView(setup, 'p3')
  assert.equal(open.race, null)
  assert.equal(open.selfBet, null)
  assert.equal(open.betCount, 3)
  assert.deepEqual(open.marbleIds, ids(4))
  assert.deepEqual(betView(setup, 'p0').selfBet, { marbleId: 'p0', amount: 3_000 })
  assert.deepEqual(Object.keys(open).sort(), ['betCount', 'betsCloseOffsetMs', 'course', 'kind', 'marbleIds', 'race', 'selfBet', 'selfPassed'], 'start lanes, bets and outcome stay on the server')
  advance(setup.game, content, setup.connected, setup.time + 1_500)
  assert.equal(betView(setup, 'p3').race, null, 'one player is still choosing')

  act(setup, 'p3', { type: 'pass' }, setup.time + 2_000)
  assert.throws(() => act(setup, 'p3', { type: 'bet', marbleId: 'p0', amount: 100 }, setup.time + 2_000), { code: 'MINIGAME_ALREADY_PLAYED' })
  assert.equal(betView(setup, 'p3', setup.time + 2_000).selfPassed, true)
  advance(setup.game, content, setup.connected, setup.time + 2_000)
  const race = betView(setup, 'p3', setup.time + 2_000).race!
  assert.equal(race.startOffsetMs, 2_000 + GATE_MS)
  assert.deepEqual([...race.slots].sort(), ids(4))
  assert.deepEqual(race.bets.p1, { marbleId: 'p2', amount: 200 })
  assert.throws(() => act(setup, 'p3', { type: 'bet', marbleId: 'p0', amount: 100 }, setup.time + 2_100), { code: 'ACTION_TOO_LATE' })

  const end = setup.time + race.startOffsetMs + race.durationMs + OUTRO_MS
  advance(setup.game, content, setup.connected, end - 1)
  assert.equal(setup.game.phase, 'minigame_playing', 'the arrival stays on screen')
  const rows = finishedRows(setup, end)
  const position = (marbleId: string) => race.order.indexOf(marbleId) + 1
  const expected = { p0: betPayout(3_000, position('p0'), 4), p1: Math.max(0, betPayout(200, position('p2'), 4)), p2: betPayout(1_000, position('p3'), 4), p3: 0 }
  assert.deepEqual(Object.fromEntries(rows.map(row => [row.playerId, row.points])), expected)
  assert.equal(rows.find(row => row.playerId === 'p2')!.detail, position('p3'))
  assert.equal(setup.game.players[1].points, Math.max(0, betPayout(200, position('p2'), 4)), 'the house stake never goes below zero')
})

test('Crazy Bet waits for a first bet, closes on time, and pays nothing to who did not bet or retired', () => {
  const setup = startKind('bet', 3)
  advance(setup.game, content, setup.connected, setup.time + 5_000)
  assert.equal(betView(setup, 'p0').race, null, 'no bets: the close waits for the clock')
  setup.game.players[0].points = 500
  act(setup, 'p0', { type: 'bet', marbleId: 'p1', amount: 500 })
  retire(setup.game, 'p0', setup.time + 6_000)
  advance(setup.game, content, setup.connected, setup.time + BET_MS)
  const race = betView(setup, 'p1', setup.time + BET_MS).race!
  assert.equal(race.startOffsetMs, BET_MS + GATE_MS)
  const rows = finishedRows(setup, setup.time + race.startOffsetMs + race.durationMs + OUTRO_MS)
  assert.ok(rows.every(row => row.points === 0 && row.detail === null))
  assert.equal(setup.game.players[0].points, 500)
})

test('Crazy Bet closes early when everyone passes', () => {
  const setup = startKind('bet', 2)
  for (const id of ['p0', 'p1']) act(setup, id, { type: 'pass' })
  advance(setup.game, content, setup.connected, setup.time + 1_500)
  const race = betView(setup, 'p0', setup.time + 1_500).race!
  assert.equal(race.startOffsetMs, 1_500 + GATE_MS)
  assert.ok(finishedRows(setup, setup.time + race.startOffsetMs + race.durationMs + OUTRO_MS).every(row => row.points === 0))
})

test('Crazy Bet payouts go from plus to minus the stake in proportion to the arrival', () => {
  const table = (marbles: number) => Array.from({ length: marbles }, (_, index) => betPayout(1_000, index + 1, marbles))
  assert.deepEqual(table(2), [1_000, -1_000])
  assert.deepEqual(table(4), [1_000, 333, -333, -1_000])
  assert.deepEqual(table(5), [1_000, 500, 0, -500, -1_000])
  assert.deepEqual(table(10), [1_000, 778, 556, 333, 111, -111, -333, -556, -778, -1_000])
})

test('a restart during Crazy Bet goes back to the preview and moves no points', () => {
  const setup = startKind('bet', 2)
  setup.game.players[0].points = 1_000
  act(setup, 'p0', { type: 'bet', marbleId: 'p1', amount: 1_000 })
  act(setup, 'p1', { type: 'bet', marbleId: 'p1', amount: 200 })
  advance(setup.game, content, setup.connected, setup.time + 1_000)
  assert.notEqual(betView(setup, 'p0').race, null)
  assert.equal(recoverGame(setup.game, setup.time + 10_000, content), true)
  assert.equal(setup.game.phase, 'minigame_intro')
  assert.equal(setup.game.wheel!.minigame!.state, null)
  assert.deepEqual(setup.game.players.map(player => player.points), [1_000, 0])
})

test('flash for everyone scores all; personal flash accepts only the spinner', () => {
  const all = wheelGame(4)
  let time = land(all.game, all.connected, 'flash_all', all.now)
  assert.equal(all.game.phase, 'flash_intro')
  assert.equal(snapshot(all.game, 'p0', all.connected, time).wheel!.flash!.question, null)
  advance(all.game, content, all.connected, time += 3_000)
  assert.equal(all.game.phase, 'flash_question')
  const flash = all.game.wheel!.flash!
  const hidden = snapshot(all.game, 'p0', all.connected, time)
  assert.equal(hidden.wheel!.flash!.reveal, null)
  assert.ok(!JSON.stringify(hidden.wheel!.flash).includes('correctOptionId'))
  flashAnswer(all.game, 'p0', flash.id, 'w', time)
  flashAnswer(all.game, 'p1', flash.id, 'x', time)
  assert.throws(() => flashAnswer(all.game, 'p0', flash.id, 'x', time), { code: 'ALREADY_ANSWERED' })
  flashAnswer(all.game, 'p2', flash.id, 'w', time + 7_500)
  flashAnswer(all.game, 'p3', flash.id, 'x', time)
  advance(all.game, content, all.connected, time + 7_500)
  assert.equal(all.game.phase, 'flash_reveal', 'si chiude quando hanno risposto tutti')
  assert.deepEqual(flash.points, { p0: 1000, p1: 0, p2: 750, p3: 0 })

  const solo = wheelGame(4)
  const spinner = solo.game.wheel!.schedule[0]
  const other = ids(4).find(id => id !== spinner)!
  time = land(solo.game, solo.connected, 'flash_self', solo.now)
  advance(solo.game, content, solo.connected, time += 3_000)
  const personal = solo.game.wheel!.flash!
  assert.equal(snapshot(solo.game, other, solo.connected, time).wheel!.flash!.canAnswer, false)
  assert.ok(snapshot(solo.game, other, solo.connected, time).wheel!.flash!.question, 'gli altri vedono la domanda')
  assert.throws(() => flashAnswer(solo.game, other, personal.id, 'w', time), { code: 'NOT_YOUR_TURN' })
  flashAnswer(solo.game, spinner, personal.id, 'w', time)
  advance(solo.game, content, solo.connected, time)
  assert.equal(solo.game.phase, 'flash_reveal')

  const away = wheelGame(4)
  const absent = away.game.wheel!.schedule[0]
  applySpin(away.game, 0, away.now, false, sliceOf('flash_self'))
  const online = new Set(ids(4).filter(id => id !== absent))
  advance(away.game, content, online, away.game.deadline!)
  assert.equal(away.game.phase, 'wheel_turn', 'turno a zero se chi ha girato è disconnesso')
  assert.equal(away.game.wheel!.cursor, 1)
})

test('a restart never repeats a spin or its effect and restarts only what was on the phones', () => {
  const spinning = wheelGame(4)
  const spinner = spinning.game.players.find(player => player.id === spinning.game.wheel!.schedule[0])!
  applySpin(spinning.game, 0, spinning.now, false, sliceOf('plus'))
  const saved = structuredClone(spinning.game)
  assert.equal(recoverGame(saved, spinning.now + 500, content), true)
  assert.equal(saved.phase, 'wheel_effect')
  assert.equal(saved.players.find(player => player.id === spinner.id)!.points, 500)
  assert.equal(saved.wheel!.cursor, 0)

  const playing = startKind('timer')
  const runId = playing.run.runId
  const copy = structuredClone(playing.game)
  assert.equal(recoverGame(copy, playing.time + 500, content), true)
  assert.equal(copy.phase, 'minigame_intro')
  assert.notEqual(copy.wheel!.minigame!.runId, runId)
  assert.deepEqual(copy.wheel!.minigame!.confirmedIds, [])
  assert.throws(() => minigameAction(copy, 'p0', runId, 'old', { type: 'stop', elapsedMs: 100 }, playing.connected, playing.time + 600), { code: 'STALE_MINIGAME' })

  const flash = wheelGame(4)
  let time = land(flash.game, flash.connected, 'flash_all', flash.now)
  advance(flash.game, content, flash.connected, time += 3_000)
  const oldId = flash.game.wheel!.flash!.id
  const oldQuestion = flash.game.wheel!.flash!.question.id
  const flashCopy = structuredClone(flash.game)
  assert.equal(recoverGame(flashCopy, time + 100, content), true)
  assert.equal(flashCopy.phase, 'flash_intro')
  assert.notEqual(flashCopy.wheel!.flash!.id, oldId)
  assert.notEqual(flashCopy.wheel!.flash!.question.id, oldQuestion)
  assert.equal(flashCopy.wheel!.cursor, 0)

  for (const kind of ['wheel_turn', 'wheel_effect', 'minigame_results', 'flash_reveal'] as const) {
    const generic = wheelGame(4)
    generic.game.phase = kind
    assert.equal(recoverGame(generic.game, generic.now + 1, content), true)
    assert.equal(generic.game.phase, 'suspended')
    advance(generic.game, content, generic.connected, generic.now + 2)
    assert.equal(generic.game.phase, kind)
  }
})

test('complete phases run for 2, 4 and 10 players and end in the final summary', () => {
  for (const count of [2, 4, 10]) {
    const { game, connected, now } = wheelGame(count)
    let time = now
    const kinds: WheelSliceKind[] = ['minigame', 'plus', 'flash_all', 'minus', 'flash_self', 'double', 'half']
    let turn = 0
    while (game.phase !== 'wheel_summary') {
      assert.equal(game.phase, 'wheel_turn')
      time = land(game, connected, kinds[turn++ % kinds.length], time)
      const scene = game.phase as string
      if (scene === 'minigame_intro') {
        for (const id of connected) confirmMinigame(game, id, game.wheel!.minigame!.runId)
        advance(game, content, connected, time)
        assert.equal(game.phase as string, 'minigame_playing')
        advance(game, content, connected, time += Math.max(...Object.values(MINIGAMES).map(minigame => minigame.durationMs)))
        assert.equal(game.phase as string, 'minigame_results')
        advance(game, content, connected, time += 5_000)
      } else if (scene === 'flash_intro') {
        advance(game, content, connected, time += 3_000)
        advance(game, content, connected, time += 15_000)
        assert.equal(game.phase as string, 'flash_reveal')
        advance(game, content, connected, time += 5_000)
      } else {
        assert.equal(game.phase, 'wheel_effect')
        advance(game, content, connected, time += 5_000)
      }
    }
    assert.equal(turn, count * turnsPerPlayer(count))
    assert.ok(game.players.every(player => player.points >= 0))
    assert.equal(snapshot(game, 'p0', connected, time).players[0].wheelDelta !== undefined, true)
    continueGame(game, 'p0', content, connected, game.round, 'wheel_summary', time)
    assert.equal(game.phase, 'phase_complete')
  }
})

test('dev skip jumps to a fresh bonus or wheel from any stage', () => {
  const players = ids(2).map(id => ({ id, nickname: id, avatarId: 'panda' as const }))
  const connected = new Set(ids(2))
  const game = createGame(players, content, 1_000)
  devSkip(game, 'bonus', 2_000)
  assert.equal(game.phase, 'bonus_intro')
  continueGame(game, 'p0', content, connected, game.round, 'bonus_intro', 3_000)
  assert.equal(game.phase, 'bonus_playing')
  assert.equal(game.bonus!.questions.length, 21)
  devSkip(game, 'wheel', 4_000)
  assert.equal(game.phase, 'wheel_intro')
  assert.equal(game.wheel!.schedule.length, 8)
  continueGame(game, 'p1', content, connected, game.round, 'wheel_intro', 5_000)
  assert.equal(game.phase, 'wheel_turn')
  advance(game, content, connected, 5_001)
  assert.equal(game.phase, 'wheel_turn')
  devSkip(game, 'bonus', 6_000)
  assert.equal(game.bonus!.results, null)
  assert.equal(snapshot(game, 'p0', connected, 6_000).bonus!.chain, 0)
  devSkip(game, 'bet', 7_000)
  assert.equal(game.phase, 'minigame_intro')
  assert.equal(game.wheel!.minigame!.kind, 'bet')
})

test('matches saved before the wheel keep ending after the bonus', () => {
  const players = ids(2).map(id => ({ id, nickname: id, avatarId: 'panda' as const }))
  const game = createGame(players, content, 1_000)
  delete game.wheel
  game.phase = 'bonus_results'
  game.opensAt = 1_000
  game.deadline = null
  continueGame(game, 'p0', content, new Set(ids(2)), 0, 'bonus_results', 2_000)
  assert.equal(game.phase, 'phase_complete')
  assert.equal(snapshot(game, 'p0', new Set(ids(2)), 2_000).wheel, null)
})
