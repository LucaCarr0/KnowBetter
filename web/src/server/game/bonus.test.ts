import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getBonusCatalog } from '../content/bonus-catalog'
import { answer, advance, bonusAnswer, continueGame, createGame, GameRuleError, recoverGame, retire, snapshot, usePower, vote, type GameContent, type GameState } from './engine'

const roster = Array.from({ length: 10 }, (_, index) => ({ id: `bonus-player-${index}`, nickname: `Giocatore ${index + 1}`, avatarId: 'panda' as const }))
const config = { countdownMs: 1, voteMs: 10, categoryRevealMs: 1, questionMs: 1000, roundRevealMs: 1, scoreboardMs: 1 }
const content = (): GameContent => ({
  categories: ['arte', 'storia', 'scienze'].map(id => ({ id, name: id })),
  questions: ['arte', 'storia', 'scienze'].flatMap(categoryId => Array.from({ length: 6 }, (_, index) => ({
    id: `${categoryId}-${index}`, categoryId, prompt: `Domanda ${categoryId} ${index}`,
    options: ['a', 'b', 'c', 'd'].map(id => ({ id, text: `Risposta ${id}` })), correctOptionId: 'a',
    difficulty: 'easy', language: 'it', sourceName: 'Fixture', sourceUrl: 'https://example.test', license: 'CC0', sourceId: `${index}`,
  }))),
  bonusQuestions: getBonusCatalog().questions,
})
const rule = (code: string) => (error: unknown) => error instanceof GameRuleError && error.code === code
const online = (game: GameState) => new Set(game.players.filter(player => !player.retired).map(player => player.id))
const view = (game: GameState, playerId = roster[0].id, now = game.opensAt) => snapshot(game, playerId, online(game), now)

function intro(count = 2): { game: GameState; catalog: GameContent } {
  const catalog = content()
  const game = createGame(roster.slice(0, count), catalog, 1000, config)
  // Individual bonus rules start from the checkpoint after the fifth scoreboard.
  game.phase = 'scoreboard'
  game.round = 5
  advance(game, catalog, online(game), game.deadline!)
  assert.equal(game.phase, 'bonus_intro')
  return { game, catalog }
}

function playing(count = 2): { game: GameState; catalog: GameContent; startedAt: number } {
  const result = intro(count)
  continueGame(result.game, roster[1].id, result.catalog, online(result.game), 5, 'bonus_intro', result.game.opensAt)
  assert.equal(result.game.phase, 'bonus_playing')
  return { ...result, startedAt: result.game.opensAt }
}

function tap(game: GameState, playerId: string, now: number, falseAnswer = true): void {
  const bonus = game.bonus!
  const current = view(game, playerId, now).bonus!
  const question = bonus.questions[current.chain]
  const option = question.options.find(entry => falseAnswer ? entry.id !== question.correctOptionId : entry.id === question.correctOptionId)!
  bonusAnswer(game, playerId, option.id, current.question!.instanceId, bonus.runId, now)
}

test('new matches reject insufficient or invalid binary catalogs before trivia starts', () => {
  for (const count of [0, 20]) {
    const catalog = content()
    catalog.bonusQuestions = catalog.bonusQuestions!.slice(0, count)
    assert.throws(() => createGame(roster.slice(0, 2), catalog, 0), rule('INSUFFICIENT_BONUS_CONTENT'))
  }
  const duplicate = content()
  duplicate.bonusQuestions = Array(21).fill(duplicate.bonusQuestions![0])
  assert.throws(() => createGame(roster.slice(0, 2), duplicate, 0), rule('INSUFFICIENT_BONUS_CONTENT'))
})

test('five trivia rounds lead to a manual bonus, then results and summary without a sixth round', () => {
  const catalog = content()
  const game = createGame(roster.slice(0, 2), catalog, 0, config)
  const connected = online(game)
  advance(game, catalog, connected, game.deadline!)
  continueGame(game, roster[0].id, catalog, connected, 0, 'intro', game.opensAt)
  for (let round = 1; round <= 5; round++) {
    for (const player of game.players) vote(game, player.id, 'arte', game.opensAt)
    advance(game, catalog, connected, game.opensAt)
    advance(game, catalog, connected, game.deadline!)
    for (const player of game.players) answer(game, player.id, 'a', game.rounds.at(-1)!.questionInstances[0].id, game.opensAt)
    advance(game, catalog, connected, game.opensAt)
    advance(game, catalog, connected, game.deadline!)
    advance(game, catalog, connected, game.deadline!)
    if (round < 5) continueGame(game, roster[1].id, catalog, connected, round, 'round_ready', game.opensAt)
  }
  assert.equal(game.phase, 'bonus_intro')
  assert.equal(game.deadline, null)
  assert.equal(game.rounds.length, 5)
  assert.equal(advance(game, catalog, connected, game.opensAt + 1_000_000), false)
  continueGame(game, roster[1].id, catalog, connected, 5, 'bonus_intro', game.opensAt + 1_000_000)
  assert.equal(game.deadline! - game.opensAt, 60_000)
  advance(game, catalog, connected, game.deadline!)
  assert.equal(game.phase, 'bonus_results')
  assert.equal(game.deadline, null)
  assert.equal(advance(game, catalog, connected, game.opensAt + 1_000_000), false)
  assert.deepEqual(game.players.map(player => player.points), [5000, 5000])
  continueGame(game, roster[0].id, catalog, connected, 5, 'bonus_results', game.opensAt + 1_000_000)
  assert.equal(game.phase, 'phase_complete')
  assert.equal(game.round, 5)
  assert.equal(game.rounds.length, 5)
  assert.ok(view(game).bonus!.results!.every(result => result.triviaPoints === 5000 && result.bonusPoints === 0 && result.totalPoints === 5000))
})

test('bonus introduction requires two connected players and can be released by any active contender', () => {
  const { game, catalog } = intro(3)
  assert.throws(() => continueGame(game, roster[0].id, catalog, new Set([roster[0].id]), 5, 'bonus_intro', game.opensAt), rule('NOT_ENOUGH_PLAYERS'))
  assert.throws(() => continueGame(game, roster[1].id, catalog, new Set([roster[0].id, roster[2].id]), 5, 'bonus_intro', game.opensAt), rule('PLAYER_OFFLINE'))
  retire(game, roster[2].id, game.opensAt)
  continueGame(game, roster[1].id, catalog, online(game), 5, 'bonus_intro', game.opensAt)
  assert.equal(view(game).bonus!.participantCount, 2)
  assert.equal(view(game).bonus!.questionDeadline, game.opensAt + 5000)
})

test('all players share a fixed 21-question sequence, and a twentieth-link mistake resets only its owner', () => {
  const { game, catalog, startedAt } = playing()
  assert.equal(game.bonus!.questions.length, 21)
  assert.equal(new Set(game.bonus!.questions.map(question => question.id)).size, 21)
  const first = view(game).bonus!.question!
  const other = view(game, roster[1].id).bonus!.question!
  assert.equal(first.prompt, other.prompt)
  assert.deepEqual(first.options, other.options)
  assert.notEqual(first.instanceId, other.instanceId)
  for (let index = 0; index < 20; index++) tap(game, roster[0].id, startedAt + index)
  assert.equal(view(game).bonus!.chain, 20)
  const oldInstance = view(game).bonus!.question!.instanceId
  tap(game, roster[0].id, startedAt + 20, false)
  const reset = view(game).bonus!
  assert.equal(reset.chain, 0)
  assert.equal(reset.lastOutcome, 'reset')
  assert.equal(reset.lastConsumedInstanceId, oldInstance)
  assert.equal(reset.question!.prompt, first.prompt)
  assert.deepEqual(reset.question!.options, first.options)
  assert.notEqual(reset.question!.instanceId, first.instanceId)
  assert.equal(view(game, roster[1].id).bonus!.question!.instanceId, other.instanceId)
  assert.equal(game.deadline, startedAt + 60_000)
  assert.equal(game.players[0].points, 0)
  assert.equal(advance(game, catalog, online(game), startedAt + 20), false)
})

test('finishing 21 waits for active opponents and early closure excludes retired contenders', () => {
  const { game, catalog, startedAt } = playing(3)
  for (let index = 0; index < 21; index++) tap(game, roster[0].id, startedAt + 100)
  let self = view(game).bonus!
  assert.equal(self.chain, 21)
  assert.equal(self.question, null)
  assert.equal(self.completedMs, 100)
  assert.equal(self.completedCount, 1)
  assert.equal(advance(game, catalog, online(game), startedAt + 100), false)
  retire(game, roster[2].id, startedAt + 101)
  for (let index = 0; index < 21; index++) tap(game, roster[1].id, startedAt + 200)
  assert.equal(advance(game, catalog, online(game), startedAt + 200), true)
  assert.equal(game.phase, 'bonus_results')
  self = view(game).bonus!
  assert.equal(self.participantCount, 3)
  assert.deepEqual(self.results!.filter(result => !result.retired).map(result => [result.completedMs, result.bonusPoints]), [[100, 3000], [200, 1750]])
  assert.equal(self.results!.find(result => result.playerId === roster[2].id)!.bonusPoints, 0)
  retire(game, roster[1].id, game.opensAt)
  continueGame(game, roster[0].id, catalog, online(game), 5, 'bonus_results', game.opensAt)
  assert.equal(game.phase, 'phase_complete')
})

test('personal timeouts run without input and delayed scheduler keeps the original five-second boundaries', () => {
  const { game, catalog, startedAt } = playing()
  const first = view(game).bonus!.question!.instanceId
  tap(game, roster[0].id, startedAt)
  const consumed = view(game).bonus!.lastConsumedInstanceId
  assert.equal(advance(game, catalog, new Set(), startedAt + 4999), false)
  assert.equal(view(game).bonus!.chain, 1)
  assert.equal(advance(game, catalog, new Set(), startedAt + 12_000), true)
  const current = view(game).bonus!
  assert.equal(current.chain, 0)
  assert.equal(current.questionDeadline, startedAt + 15_000)
  assert.equal(current.lastOutcome, 'timeout')
  assert.equal(current.lastConsumedInstanceId, consumed)
  assert.notEqual(current.question!.instanceId, first)
  assert.equal(game.deadline, startedAt + 60_000)
})

test('exact personal deadline resets before a stale input and exact global deadline preserves the final chain', () => {
  const { game, catalog, startedAt } = playing()
  const old = view(game).bonus!.question!
  assert.equal(advance(game, catalog, online(game), startedAt + 5000), true)
  assert.throws(() => bonusAnswer(game, roster[0].id, old.options[0].id, old.instanceId, game.bonus!.runId, startedAt + 5000), rule('STALE_QUESTION'))
  advance(game, catalog, online(game), startedAt + 55_000)
  tap(game, roster[0].id, startedAt + 55_000)
  const atEnd = view(game).bonus!
  assert.equal(atEnd.chain, 1)
  assert.equal(atEnd.questionDeadline, startedAt + 60_000)
  const next = atEnd.question!
  assert.throws(() => bonusAnswer(game, roster[0].id, next.options[0].id, next.instanceId, game.bonus!.runId, startedAt + 60_000), rule('ACTION_TOO_LATE'))
  advance(game, catalog, online(game), startedAt + 60_000)
  assert.equal(game.phase, 'bonus_results')
  assert.equal(view(game).bonus!.results!.find(result => result.playerId === roster[0].id)!.chain, 1)
  assert.equal(game.players[0].points, 3000)
})

test('a scheduler running after the minute applies earlier personal resets before final scoring', () => {
  const { game, catalog, startedAt } = playing()
  for (let index = 0; index < 20; index++) tap(game, roster[0].id, startedAt)
  advance(game, catalog, new Set(), startedAt + 90_000)
  assert.equal(game.phase, 'bonus_results')
  assert.ok(view(game).bonus!.results!.every(result => result.chain === 0 && result.bonusPoints === 0))
  assert.ok(game.players.every(player => player.points === 0))
})

test('ranking uses final chain, ties below 21 and shared competition positions for every party size', () => {
  for (let count = 2; count <= 10; count++) {
    const { game, catalog, startedAt } = playing(count)
    advance(game, catalog, online(game), startedAt + 55_000)
    for (let player = 0; player < count; player++) {
      for (let chain = 0; chain < count - player; chain++) tap(game, roster[player].id, startedAt + 55_000)
    }
    advance(game, catalog, online(game), startedAt + 60_000)
    const results = view(game).bonus!.results!
    assert.deepEqual(results.map(result => result.rank), Array.from({ length: count }, (_, index) => index + 1))
    assert.deepEqual(results.map(result => result.bonusPoints), Array.from({ length: count }, (_, index) => Math.round(3000 - 2500 * index / (count - 1))))
    if (count === 4) assert.deepEqual(results.map(result => result.bonusPoints), [3000, 2167, 1333, 500])
  }
  const { game, catalog, startedAt } = playing(4)
  advance(game, catalog, online(game), startedAt + 55_000)
  for (const [index, chain] of [3, 3, 1, 0].entries()) for (let tapIndex = 0; tapIndex < chain; tapIndex++) tap(game, roster[index].id, startedAt + 55_000 + index)
  advance(game, catalog, online(game), startedAt + 60_000)
  assert.deepEqual(view(game).bonus!.results!.map(result => [result.rank, result.bonusPoints]), [[1, 3000], [1, 3000], [3, 1333], [4, 0]])
})

test('completion times rank only perfect chains and equal completion times share the prize', () => {
  const { game, catalog, startedAt } = playing(4)
  for (const [index, elapsed] of [100, 100, 200].entries()) for (let chain = 0; chain < 21; chain++) tap(game, roster[index].id, startedAt + elapsed)
  advance(game, catalog, online(game), startedAt + 60_000)
  assert.deepEqual(view(game).bonus!.results!.map(result => [result.rank, result.completedMs, result.bonusPoints]), [[1, 100, 3000], [1, 100, 3000], [3, 200, 1333], [4, null, 0]])
})

test('duplicate taps, obsolete instances and invalid options cannot mutate progress or scores', () => {
  const { game, startedAt } = playing()
  const before = view(game).bonus!
  const first = before.question!
  const runId = before.runId
  assert.throws(() => bonusAnswer(game, 'intruder', first.options[0].id, first.instanceId, runId, startedAt), rule('NOT_IN_GAME'))
  assert.throws(() => bonusAnswer(game, roster[0].id, 'invented-option', first.instanceId, runId, startedAt), rule('INVALID_OPTION'))
  tap(game, roster[0].id, startedAt)
  const accepted = JSON.stringify(game)
  assert.throws(() => bonusAnswer(game, roster[0].id, first.options[0].id, first.instanceId, runId, startedAt), rule('STALE_QUESTION'))
  assert.equal(JSON.stringify(game), accepted)
  tap(game, roster[0].id, startedAt, false)
  const reset = JSON.stringify(game)
  assert.throws(() => bonusAnswer(game, roster[0].id, first.options[0].id, first.instanceId, runId, startedAt), rule('STALE_QUESTION'))
  assert.equal(JSON.stringify(game), reset)
})

test('snapshots expose only the current personal question, detached progress and no keys or future questions', () => {
  const { game, startedAt } = playing()
  tap(game, roster[0].id, startedAt)
  const own = view(game).bonus!
  const other = view(game, roster[1].id).bonus!
  assert.equal(own.chain, 1)
  assert.equal(other.chain, 0)
  assert.notEqual(own.question!.prompt, other.question!.prompt)
  const serialized = JSON.stringify(view(game))
  for (const privateKey of ['correctOptionId', 'verification', 'sourceUrl', 'participantIds', 'progress', 'questions']) assert.equal(serialized.includes(`"${privateKey}"`), false, privateKey)
  assert.equal(serialized.includes(game.bonus!.questions[2].prompt), false)
  const original = game.bonus!.questions[1].options[0].text
  own.question!.options[0].text = 'alterata'
  assert.equal(game.bonus!.questions[1].options[0].text, original)
  assert.equal(view(game).powers.effect, null)
  assert.throws(() => usePower(game, roster[0].id, game.powerInventories![roster[0].id][0].id, roster[1].id, own.question!.instanceId, online(game), startedAt), rule('WRONG_GAME_PHASE'))
})

test('JSONB recovery resets only an unfinished bonus, and finalized prizes are never assigned twice', () => {
  const { game: original, catalog, startedAt } = playing()
  original.players[0].points = 4200
  original.players[1].points = 3500
  tap(original, roster[0].id, startedAt)
  const oldRun = original.bonus!.runId
  const oldQuestion = view(original).bonus!.question!
  const game = JSON.parse(JSON.stringify(original)) as GameState
  assert.equal(recoverGame(game, startedAt + 100), true)
  assert.equal(game.phase, 'bonus_intro')
  assert.equal(game.deadline, null)
  assert.notEqual(game.bonus!.runId, oldRun)
  assert.deepEqual(game.players.map(player => player.points), [4200, 3500])
  continueGame(game, roster[1].id, catalog, online(game), 5, 'bonus_intro', startedAt + 10_000)
  assert.equal(view(game).bonus!.chain, 0)
  assert.equal(game.deadline, startedAt + 70_000)
  assert.throws(() => bonusAnswer(game, roster[0].id, oldQuestion.options[0].id, oldQuestion.instanceId, oldRun, game.opensAt), error => error instanceof GameRuleError)
  const newStart = game.opensAt
  advance(game, catalog, online(game), newStart + 55_000)
  tap(game, roster[0].id, newStart + 55_000)
  advance(game, catalog, online(game), newStart + 60_000)
  const finalized = JSON.stringify(game)
  const restored = JSON.parse(finalized) as GameState
  assert.equal(recoverGame(restored, newStart + 100_000), false)
  assert.equal(advance(restored, catalog, online(restored), newStart + 100_000), false)
  assert.equal(JSON.stringify(restored), finalized)
  assert.deepEqual(restored.players.map(player => player.points), [7200, 3500])
})
