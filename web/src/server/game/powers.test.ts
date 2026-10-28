import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getBonusCatalog } from '../content/bonus-catalog'
import { MAX_POWER_CARDS, POWERS, powerDropProbability, shuffleAnswerOptions, type PowerKind } from '../../features/game/powers'
import { advance, answer, awardRoundPowers, clearPower, continueGame, createGame, GameRuleError, readyQuestion, recoverGame, scrambleAnswerWords, snapshot, usePower, vote, type GameContent, type GameState } from './engine'

const roster = ['Ada', 'Bruno', 'Carla'].map((nickname, index) => ({ id: `player-${index}`, nickname, avatarId: 'panda' as const }))
const online = new Set(roster.map(player => player.id))
const content: GameContent = {
  bonusQuestions: getBonusCatalog().questions,
  categories: ['arte', 'storia', 'scienze'].map(id => ({ id, name: id })),
  questions: ['arte', 'storia', 'scienze'].flatMap(categoryId => Array.from({ length: 8 }, (_, index) => ({
    id: `${categoryId}-${index}`, categoryId, prompt: `Quale gatto ama Roma? ${index}`,
    options: ['Roma', 'Milano', 'Napoli', 'Torino'].map((text, index) => ({ id: `${index}`, text })),
    correctOptionId: '0', difficulty: 'easy', language: 'it', sourceName: 'Fixture', sourceUrl: 'https://example.test', license: 'CC0', sourceId: `${index}`,
  }))),
}
const config = { countdownMs: 5, voteMs: 10, categoryRevealMs: 80, questionMs: 1000, roundRevealMs: 5, scoreboardMs: 5 }
const rule = (code: string) => (error: unknown) => error instanceof GameRuleError && error.code === code
const current = (game: GameState) => game.rounds.at(-1)!
const instance = (game: GameState) => current(game).questionInstances.at(-1)!
const view = (game: GameState, player = roster[0].id) => snapshot(game, player, online, game.opensAt)

function preparation(): GameState {
  const game = createGame(roster, content, 0, config)
  advance(game, content, online, game.deadline!)
  continueGame(game, roster[0].id, content, online, 0, 'intro', game.opensAt)
  for (const player of roster) vote(game, player.id, 'arte', game.opensAt)
  advance(game, content, online, game.opensAt)
  assert.equal(game.phase, 'category_reveal')
  return game
}

function attack(game: GameState, kind: PowerKind, from = roster[0].id, target = roster[1].id): void {
  const card = game.powerInventories![from][0]
  card.kind = kind
  usePower(game, from, card.id, target, instance(game).id, online, game.opensAt)
}

function open(game: GameState): void {
  advance(game, content, online, game.deadline!)
  assert.equal(game.phase, 'question')
}

test('one initial consumable power is private, and snapshots never deal more cards', () => {
  const game = preparation()
  const before = JSON.stringify(game.powerInventories)
  for (const player of roster) {
    const own = view(game, player.id)
    assert.equal(own.powers.inventory.length, 1)
    assert.ok(POWERS.some(power => power.kind === own.powers.inventory[0].kind))
    assert.equal(own.question, null)
    for (const other of roster.filter(other => other.id !== player.id)) {
      assert.equal(JSON.stringify(own).includes(game.powerInventories![other.id][0].id), false)
    }
  }
  awardRoundPowers(game, () => 0)
  assert.equal(JSON.stringify(game.powerInventories), before)
  const stolen = game.powerInventories![roster[1].id][0].id
  assert.throws(() => usePower(game, roster[0].id, stolen, roster[1].id, instance(game).id, online, game.opensAt), rule('POWER_NOT_OWNED'))
})

test('ranked p*k drops respect boundaries, ties, inventory cap and one roll per round', () => {
  assert.equal(powerDropProbability(1, 3), 0.2)
  assert.equal(powerDropProbability(2, 3), 0.4)
  assert.equal(powerDropProbability(3, 3), 0.6)
  const game = preparation()
  game.players.forEach((player, index) => { player.points = 1000 - index * 100 })
  game.round = 2
  current(game).powersDealt = false
  awardRoundPowers(game, () => 0.4)
  assert.deepEqual(roster.map(player => game.powerInventories![player.id].length), [1, 1, 2])
  const inventory = JSON.stringify(game.powerInventories)
  awardRoundPowers(game, () => 0)
  assert.equal(JSON.stringify(game.powerInventories), inventory)
  current(game).powersDealt = false
  game.round = 3
  game.players[0].points = game.players[1].points
  awardRoundPowers(game, () => 0.25)
  assert.deepEqual(roster.map(player => game.powerInventories![player.id].length), [1, 1, MAX_POWER_CARDS])
  current(game).powersDealt = false
  game.players[2].retired = true
  game.powerInventories![roster[2].id] = []
  awardRoundPowers(game, () => 0)
  assert.equal(game.powerInventories![roster[2].id].length, 0)
})

test('power selection validates target, phase, instance and one effect without wasting rejected cards', () => {
  const game = preparation()
  const card = game.powerInventories![roster[0].id][0].id
  const id = instance(game).id
  const before = JSON.stringify(game)
  assert.throws(() => usePower(game, roster[0].id, card, roster[0].id, id, online, game.opensAt), rule('INVALID_TARGET'))
  assert.throws(() => usePower(game, roster[0].id, card, roster[1].id, id, new Set([roster[0].id]), game.opensAt), rule('INVALID_TARGET'))
  assert.throws(() => usePower(game, roster[0].id, card, roster[1].id, 'old-instance', online, game.opensAt), rule('STALE_QUESTION'))
  assert.throws(() => usePower(game, roster[0].id, card, roster[1].id, id, online, game.deadline!), rule('ACTION_TOO_LATE'))
  assert.equal(JSON.stringify(game), before)
  attack(game, 'shuffle')
  assert.equal(game.powerInventories![roster[0].id].length, 0)
  assert.equal(view(game).powers.used, true)
  const thirdCard = game.powerInventories![roster[2].id][0].id
  assert.throws(() => usePower(game, roster[2].id, thirdCard, roster[1].id, id, online, game.opensAt), rule('TARGET_PROTECTED'))
  assert.equal(game.powerInventories![roster[2].id].length, 1)
  assert.throws(() => usePower(game, roster[0].id, card, roster[2].id, id, online, game.opensAt), rule('ALREADY_READY'))
  readyQuestion(game, roster[1].id, id, game.opensAt)
  assert.equal(advance(game, content, online, game.opensAt), false)
  readyQuestion(game, roster[2].id, id, game.opensAt)
  assert.equal(advance(game, content, online, game.opensAt), true)
  assert.equal(game.phase, 'question')
  assert.equal(game.deadline! - game.opensAt, config.questionMs)
  assert.throws(() => usePower(game, roster[2].id, thirdCard, roster[0].id, id, online, game.opensAt), rule('WRONG_GAME_PHASE'))
})

test('scramble reverses only inner graphemes and keeps numbers, accents, punctuation and spacing', () => {
  assert.equal(scrambleAnswerWords('Roma, gatto! Io ho 1234.'), 'Rmoa, gttao! Io ho 1234.')
  assert.equal(scrambleAnswerWords('caffè  città'), 'cffaè  cttià')
  const accented = 'caffe\u0301'
  assert.equal(scrambleAnswerWords(scrambleAnswerWords(accented)), accented)
  const game = preparation()
  attack(game, 'scramble')
  open(game)
  const victim = view(game, roster[1].id)
  assert.equal(victim.question!.options.find(option => option.id === '0')!.text, 'Rmoa')
  assert.equal(view(game).question!.options.find(option => option.id === '0')!.text, 'Roma')
  assert.equal(victim.reveal, null)
  advance(game, content, online, game.deadline!)
  assert.equal(view(game, roster[1].id).question!.options.find(option => option.id === '0')!.text, 'Roma')
  assert.equal(view(game, roster[1].id).powers.effect, null)
})

test('fog hides unrevealed text only for its target and server rejects an unseen answer', () => {
  const game = preparation()
  attack(game, 'fog')
  open(game)
  const id = instance(game).id
  assert.ok(view(game, roster[1].id).question!.options.every(option => option.text === ''))
  assert.ok(view(game).question!.options.every(option => option.text.length > 0))
  assert.throws(() => answer(game, roster[1].id, '0', id, game.opensAt), rule('POWER_BLOCKED'))
  clearPower(game, roster[1].id, id, '0', game.opensAt)
  assert.equal(view(game, roster[1].id).question!.options.find(option => option.id === '0')!.text, 'Roma')
  assert.equal(view(game, roster[1].id).question!.options.filter(option => option.text !== '').length, 1)
  assert.throws(() => clearPower(game, roster[1].id, id, '0', game.opensAt), rule('POWER_ALREADY_CLEARED'))
  assert.throws(() => clearPower(game, roster[1].id, id, 'invalid', game.opensAt), rule('INVALID_OPTION'))
  answer(game, roster[1].id, '0', id, game.opensAt)
})

test('shuffle moves every option at one-second boundaries without changing IDs or selection', () => {
  const options = ['a', 'b', 'c', 'd'].map(id => ({ id, text: `Risposta ${id}` }))
  const original = structuredClone(options)
  const key = 'question-instance:player-b'
  assert.deepEqual(shuffleAnswerOptions(options, -100, key), options)
  assert.deepEqual(shuffleAnswerOptions(options, 999, key), options)
  let previous = options
  for (let elapsed = 1000; elapsed <= 15_000; elapsed += 1000) {
    const shuffled = shuffleAnswerOptions(options, elapsed, key)
    assert.deepEqual(shuffled.map(option => option.id).sort(), ['a', 'b', 'c', 'd'])
    assert.ok(shuffled.every((option, index) => option.id !== previous[index].id))
    assert.deepEqual(shuffleAnswerOptions(options, elapsed + 999, key), shuffled)
    assert.equal(shuffled.find(option => option.id === 'c'), options[2])
    assert.deepEqual(shuffleAnswerOptions(options, elapsed, key), shuffled)
    previous = shuffled
  }
  assert.deepEqual(options, original)
  assert.deepEqual(shuffleAnswerOptions([], 1000, key), [])
  assert.deepEqual(shuffleAnswerOptions(options.slice(0, 1), 1000, key), options.slice(0, 1))
  assert.notDeepEqual(shuffleAnswerOptions(options, 3000, 'another-question:player-c'), shuffleAnswerOptions(options, 3000, key))
})

test('shuffle affects only its target and accepts the selected answer ID without unlock steps', () => {
  const game = preparation()
  attack(game, 'shuffle')
  open(game)
  const id = instance(game).id
  const victim = view(game, roster[1].id)
  assert.equal(victim.powers.effect!.kind, 'shuffle')
  assert.equal(view(game).powers.effect, null)
  assert.deepEqual(victim.question!.options, view(game).question!.options)
  assert.throws(() => clearPower(game, roster[1].id, id, '0', game.opensAt), rule('NO_CLEARABLE_POWER'))
  answer(game, roster[1].id, '0', id, game.opensAt + 100)
  advance(game, content, online, game.deadline!)
  assert.equal(game.players[1].points, 950)
  assert.equal(view(game, roster[1].id).powers.effect, null)
})

test('saved lock cards and effects become shuffle without changing ownership or card IDs', () => {
  const original = preparation()
  original.powerInventories![roster[2].id][0].kind = 'shuffle'
  attack(original, 'shuffle')
  const inventory = original.powerInventories![roster[2].id][0].id
  const game = JSON.parse(JSON.stringify(original).replaceAll('"kind":"shuffle"', '"kind":"locks"')) as GameState
  assert.equal(recoverGame(game, game.opensAt + 1), true)
  assert.equal(view(game, roster[2].id).powers.inventory[0].kind, 'shuffle')
  assert.equal(view(game, roster[2].id).powers.inventory[0].id, inventory)
  assert.equal(game.powerInventories![roster[0].id].length, 0)
  advance(game, content, online, game.opensAt + 1)
  assert.equal(view(game, roster[1].id).powers.effect!.kind, 'shuffle')
  open(game)
  answer(game, roster[1].id, '0', instance(game).id, game.opensAt)
  assert.equal(view(game, roster[1].id).selfAnswer, '0')
})

test('a replacement question preserves spent powers and target but resets obstacle progress', () => {
  let game = preparation()
  attack(game, 'fog')
  open(game)
  const oldId = instance(game).id
  clearPower(game, roster[1].id, oldId, '0', game.opensAt)
  const inventory = JSON.stringify(game.powerInventories)
  game = JSON.parse(JSON.stringify(game)) as GameState
  recoverGame(game, game.opensAt + 10)
  assert.equal(game.phase, 'suspended')
  advance(game, content, online, game.opensAt + 1)
  assert.equal(game.phase, 'category_reveal')
  assert.notEqual(instance(game).id, oldId)
  assert.equal(JSON.stringify(game.powerInventories), inventory)
  assert.equal(view(game).powers.used, true)
  assert.deepEqual(view(game, roster[1].id).powers.effect!.revealedOptionIds, [])
  open(game)
  assert.throws(() => clearPower(game, roster[1].id, oldId, '0', game.opensAt), rule('STALE_QUESTION'))
  assert.ok(view(game, roster[1].id).question!.options.every(option => option.text === ''))
})

test('old JSONB games without powers continue without retroactive inventory or private leaks', () => {
  const game = preparation()
  delete game.powerInventories
  delete current(game).powerReadyIds
  delete current(game).powersDealt
  recoverGame(game, game.opensAt + 1)
  advance(game, content, online, game.opensAt + 1)
  assert.equal(game.phase, 'category_reveal')
  assert.deepEqual(view(game).powers.inventory, [])
  open(game)
  answer(game, roster[0].id, '0', instance(game).id, game.opensAt)
  assert.equal(view(game).selfAnswer, '0')
})

test('commentary is generated after scoring, shared and retained through the scoreboard pause', () => {
  const game = preparation()
  assert.deepEqual(view(game).commentary, [])
  open(game)
  for (const player of roster) answer(game, player.id, '0', instance(game).id, game.opensAt)
  advance(game, content, online, game.opensAt)
  const commentary = view(game).commentary
  assert.match(commentary[0], /Tutti/)
  assert.deepEqual(view(game, roster[1].id).commentary, commentary)
  advance(game, content, online, game.deadline!)
  advance(game, content, online, game.deadline!)
  assert.equal(game.phase, 'round_ready')
  assert.deepEqual(view(game).commentary, commentary)
  assert.deepEqual(current(JSON.parse(JSON.stringify(game))).commentary, commentary)
})
