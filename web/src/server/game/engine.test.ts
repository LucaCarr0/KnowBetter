import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getBonusCatalog } from '../content/bonus-catalog'
import { answer, advance, continueGame, createGame, GameRuleError, isPlayableQuestion, recoverGame, retire, snapshot, vote, type GameContent, type GameState, type TriviaQuestion } from './engine'

const roster = [
  { id: 'player-a', nickname: 'Ada', avatarId: 'panda' as const },
  { id: 'player-b', nickname: 'Bruno', avatarId: 'dog' as const },
]
const connected = new Set(roster.map(player => player.id))

function content(questionCount = 8): GameContent {
  const categories = ['animals', 'art', 'history'].map(id => ({ id, name: id }))
  const questions = categories.flatMap(category => Array.from({ length: questionCount }, (_, index): TriviaQuestion => ({
    id: `${category.id}-${index}`, categoryId: category.id, prompt: `Question ${category.id} ${index}`,
    options: ['a', 'b', 'c', 'd'].map(id => ({ id, text: `Option ${id}` })), correctOptionId: 'a',
    difficulty: 'easy', language: 'it', sourceName: 'Fixture catalog', sourceUrl: 'https://example.test/catalog', license: 'CC0', sourceId: `${index}`, explanation: 'A verified explanation.',
  })))
  return { categories, questions, bonusQuestions: getBonusCatalog().questions }
}

const shortConfig = { countdownMs: 50, voteMs: 120, categoryRevealMs: 30, questionMs: 1000, roundRevealMs: 50, scoreboardMs: 50, suspensionMs: 900 }

function step(game: GameState, catalog: GameContent, online = connected): void {
  assert.notEqual(game.deadline, null)
  assert.equal(advance(game, catalog, online, game.deadline!), true)
}

function reachVote(game: GameState, catalog: GameContent): void {
  step(game, catalog)
  assert.equal(game.phase, 'intro')
  continueGame(game, roster[1].id, catalog, connected, 0, 'intro', game.opensAt)
  assert.equal(game.phase, 'category_vote')
}

function reachQuestion(game: GameState, catalog: GameContent, categoryId = 'animals'): void {
  if (game.phase === 'countdown') reachVote(game, catalog)
  for (const player of game.players.filter(player => !player.retired)) vote(game, player.id, categoryId, game.opensAt)
  assert.equal(advance(game, catalog, connected, game.opensAt), true)
  assert.equal(game.phase, 'category_reveal')
  step(game, catalog)
  assert.equal(game.phase, 'question')
}

function rule(code: string) {
  return (error: unknown) => error instanceof GameRuleError && error.code === code
}

test('minimum players and complete nonrepeating catalog are checked before countdown', () => {
  assert.throws(() => createGame(roster.slice(0, 1), content(), 0), rule('NOT_ENOUGH_PLAYERS'))
  assert.throws(() => createGame([roster[0], roster[0]], content(), 0), rule('NOT_ENOUGH_PLAYERS'))
  assert.throws(() => createGame(roster, content(4), 0), rule('INSUFFICIENT_CONTENT'))
  const invalid = content(5)
  invalid.questions[0].options[0].text = invalid.questions[0].options[1].text
  assert.throws(() => createGame(roster, invalid, 0), rule('INSUFFICIENT_CONTENT'))
  const game = createGame(roster, content(5), 100)
  assert.equal(game.deadline, 5100)
  assert.equal(game.config.rounds, 5)
})

test('countdown cancels as soon as fewer than two roster players remain connected', () => {
  const catalog = content()
  const game = createGame(roster, catalog, 100)
  assert.equal(advance(game, catalog, new Set([roster[0].id]), 101), true)
  assert.equal(game.phase, 'aborted')
  assert.match(game.message!, /Avvio annullato/)
  assert.equal(game.players[0].points, 0)
  assert.equal(advance(game, catalog, connected, 5200), false)
})

test('introduction has no deadline and only a connected active player can release its exact scene', () => {
  const catalog = content()
  const game = createGame(roster, catalog, 0, shortConfig)
  step(game, catalog)
  assert.equal(game.phase, 'intro')
  assert.equal(game.deadline, null)
  const initial = JSON.stringify(game)
  assert.equal(advance(game, catalog, connected, game.opensAt + 86_400_000), false)
  assert.equal(JSON.stringify(game), initial)
  assert.throws(() => continueGame(game, 'intruder', catalog, connected, 0, 'intro', game.opensAt), rule('NOT_IN_GAME'))
  assert.throws(() => continueGame(game, roster[1].id, catalog, new Set([roster[0].id]), 0, 'intro', game.opensAt), rule('PLAYER_OFFLINE'))
  assert.throws(() => continueGame(game, roster[0].id, catalog, new Set([roster[0].id]), 0, 'intro', game.opensAt), rule('NOT_ENOUGH_PLAYERS'))
  assert.throws(() => continueGame(game, roster[0].id, catalog, connected, 1, 'intro', game.opensAt), rule('STALE_ROUND'))
  assert.throws(() => continueGame(game, roster[0].id, catalog, connected, 0, 'round_ready', game.opensAt), rule('WRONG_GAME_PHASE'))
  assert.throws(() => continueGame(game, roster[0].id, catalog, connected, 0, 'intro', game.opensAt - 1), rule('ACTION_TOO_EARLY'))
  continueGame(game, roster[1].id, catalog, connected, 0, 'intro', game.opensAt + 86_400_000)
  assert.equal(game.phase, 'category_vote')
  assert.equal(game.round, 1)
  assert.equal(game.deadline! - game.opensAt, shortConfig.voteMs)
  const released = JSON.stringify(game)
  assert.throws(() => continueGame(game, roster[0].id, catalog, connected, 0, 'intro', game.opensAt), rule('STALE_ROUND'))
  assert.equal(JSON.stringify(game), released)
})

test('persisted introductions with the previous timer become manual in both sweep and recovery', () => {
  for (const recover of [false, true]) {
    const catalog = content()
    const original = createGame(roster, catalog, 0, shortConfig)
    step(original, catalog)
    Object.assign(original.config, { introMs: 10_000 })
    original.deadline = original.opensAt + 10_000
    const game = JSON.parse(JSON.stringify(original)) as GameState
    const later = game.deadline! + 100_000
    assert.equal(recover ? recoverGame(game, later) : advance(game, catalog, connected, later), true)
    assert.equal(game.phase, 'intro')
    assert.equal(game.round, 0)
    assert.equal(game.rounds.length, 0)
    assert.equal(game.deadline, null)
    assert.equal(advance(game, catalog, connected, later + 100_000), false)
    continueGame(game, roster[1].id, catalog, connected, 0, 'intro', later + 100_000)
    assert.equal(game.phase, 'category_vote')
  }
})

test('old suspended manual checkpoints never time out or start a round automatically after recovery', () => {
  for (const target of ['phase', 'next_round'] as const) {
    const catalog = content()
    const game = createGame(roster, catalog, 0, shortConfig)
    step(game, catalog)
    game.phase = 'suspended'
    game.suspension = target === 'phase' ? { target, phase: 'intro' } : { target }
    game.deadline = game.opensAt + shortConfig.suspensionMs
    assert.equal(recoverGame(game, game.deadline + 1), true)
    assert.equal(game.phase, 'intro')
    assert.equal(game.deadline, null)
    assert.equal(game.suspension, null)
    assert.equal(advance(game, catalog, connected, game.opensAt + 100_000), false)
    assert.equal(game.round, 0)
  }
})

test('long catalog entries stay unchanged but cannot be selected for a timed mobile round', () => {
  for (const kind of ['prompt', 'option', 'total']) {
    const catalog = content(5)
    for (const question of catalog.questions) {
      if (kind === 'prompt') question.prompt = 'p'.repeat(301)
      if (kind === 'option') question.options[0].text = 'a'.repeat(121)
      if (kind === 'total') {
        question.prompt = 'p'.repeat(300)
        question.options = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, text: id.repeat(index === 0 ? 76 : 75) }))
      }
      assert.equal(isPlayableQuestion(question), false)
    }
    const original = JSON.stringify(catalog)
    assert.throws(() => createGame(roster, catalog, 0), rule('INSUFFICIENT_CONTENT'))
    assert.equal(JSON.stringify(catalog), original)
  }
  const boundary = content(5)
  for (const question of boundary.questions) {
    question.prompt = 'p'.repeat(300)
    question.options = ['a', 'b', 'c', 'd'].map(id => ({ id, text: id.repeat(75) }))
    assert.equal(isPlayableQuestion(question), true)
  }
  assert.equal(createGame(roster, boundary, 0).categoryIds.length, 3)
})

test('voting is once per player, bounded by the server clock, and counts stay private until selection', () => {
  const catalog = content()
  const game = createGame(roster, catalog, 0, shortConfig)
  reachVote(game, catalog)
  const opensAt = game.opensAt
  assert.throws(() => vote(game, roster[0].id, 'animals', opensAt - 1), rule('ACTION_TOO_EARLY'))
  assert.throws(() => vote(game, 'intruder', 'animals', opensAt), rule('NOT_IN_GAME'))
  assert.throws(() => vote(game, roster[0].id, 'invalid', opensAt), rule('INVALID_CATEGORY'))
  vote(game, roster[0].id, 'animals', opensAt)
  assert.throws(() => vote(game, roster[0].id, 'art', opensAt), rule('ALREADY_VOTED'))
  const personal = snapshot(game, roster[0].id, connected, opensAt)
  const other = snapshot(game, roster[1].id, connected, opensAt)
  assert.equal(personal.selfVote, 'animals')
  assert.equal(other.selfVote, null)
  assert.equal(personal.categoryVotes, null)
  for (const player of roster) assert.equal(snapshot(game, player.id, connected, opensAt).categoryVoters, null)
  assert.equal(personal.votedCount, 1)
  assert.equal(advance(game, catalog, connected, game.deadline! - 1), false)
  assert.throws(() => vote(game, roster[1].id, 'art', game.deadline!), rule('ACTION_TOO_LATE'))
  step(game, catalog)
  assert.equal(game.phase, 'category_reveal')
  assert.equal(snapshot(game, roster[1].id, connected, game.opensAt).selectionReason, 'votes')
  assert.equal(game.rounds[0].category?.id, 'animals')
})

test('closed votes reveal detached voter IDs in roster order, including retired and offline voters', () => {
  const catalog = content()
  const contestants = [
    ...roster,
    { id: 'player-c', nickname: 'Carla', avatarId: 'owl' as const },
    { id: 'player-d', nickname: 'Dario', avatarId: 'frog' as const },
  ]
  const game = createGame(contestants, catalog, 0, shortConfig)
  assert.equal(snapshot(game, roster[0].id, connected, 0).categoryVoters, null)
  reachVote(game, catalog)
  for (const player of [...contestants].reverse()) vote(game, player.id, player.id === 'player-c' ? 'art' : 'animals', game.opensAt)
  const online = new Set([roster[0].id, 'player-c'])
  retire(game, roster[1].id, game.opensAt)
  for (const player of contestants) assert.equal(snapshot(game, player.id, online, game.opensAt).categoryVoters, null)
  assert.equal(advance(game, catalog, online, game.opensAt), true)
  assert.equal(game.phase, 'category_reveal')
  game.players[3].points = 1000
  const expected = { animals: ['player-a', 'player-b', 'player-d'], art: ['player-c'], history: [] }
  const original = JSON.stringify(game)
  const personal = snapshot(game, roster[0].id, online, game.opensAt)
  assert.equal(personal.players[0].id, 'player-d')
  for (const player of contestants) {
    const result = snapshot(game, player.id, online, game.opensAt)
    assert.deepEqual(result.categoryVoters, expected)
    for (const [categoryId, voters] of Object.entries(result.categoryVoters!)) assert.equal(voters.length, result.categoryVotes![categoryId])
    assert.deepEqual(result.categoryVoters!.animals.map(id => result.players.find(entry => entry.id === id)!.avatarId), ['panda', 'dog', 'frog'])
  }
  assert.equal(personal.players.find(player => player.id === 'player-b')!.retired, true)
  assert.equal(personal.players.find(player => player.id === 'player-d')!.connected, false)
  personal.categoryVoters!.animals.push('intruder')
  personal.categoryVoters!.history = ['player-c']
  personal.categoryVotes!.animals = 100
  assert.deepEqual(snapshot(game, roster[0].id, online, game.opensAt).categoryVoters, expected)
  assert.equal(JSON.stringify(game), original)
})

test('ties and abstentions select only the eligible categories and persist the draw result', () => {
  for (const abstain of [true, false]) {
    const catalog = content()
    const game = createGame(roster, catalog, 0, shortConfig)
    reachVote(game, catalog)
    if (!abstain) {
      vote(game, roster[0].id, 'animals', game.opensAt)
      vote(game, roster[1].id, 'art', game.opensAt)
    }
    step(game, catalog)
    const round = game.rounds[0]
    assert.equal(round.selectionReason, abstain ? 'abstention' : 'tie')
    assert.deepEqual(snapshot(game, roster[0].id, connected, game.opensAt).categoryVoters, {
      animals: abstain ? [] : [roster[0].id], art: abstain ? [] : [roster[1].id], history: [],
    })
    assert.ok((abstain ? ['animals', 'art', 'history'] : ['animals', 'art']).includes(round.category!.id))
    const selected = JSON.stringify(round.category)
    assert.equal(advance(game, catalog, connected, game.opensAt), false)
    assert.equal(JSON.stringify(round.category), selected)
  }
})

test('question begins after the announcement, solutions stay private, options are identical and detached', () => {
  const catalog = content()
  const game = createGame(roster, catalog, 0, shortConfig)
  reachVote(game, catalog)
  vote(game, roster[0].id, 'animals', game.opensAt)
  vote(game, roster[1].id, 'animals', game.opensAt)
  advance(game, catalog, connected, game.opensAt)
  const hidden = snapshot(game, roster[0].id, connected, game.opensAt)
  assert.equal(hidden.question, null)
  assert.equal(hidden.reveal, null)
  const instance = game.rounds[0].questionInstances[0]
  assert.throws(() => answer(game, roster[0].id, 'a', instance.id, game.opensAt), rule('WRONG_GAME_PHASE'))
  const openAt = game.deadline!
  step(game, catalog)
  assert.equal(game.opensAt, openAt)
  assert.equal(game.deadline, openAt + shortConfig.questionMs)
  const own = snapshot(game, roster[0].id, connected, openAt)
  const other = snapshot(game, roster[1].id, connected, openAt)
  assert.deepEqual(own.question, other.question)
  assert.equal(own.reveal, null)
  assert.equal(JSON.stringify(own).includes('correctOptionId'), false)
  assert.equal(JSON.stringify(own).includes('explanation'), false)
  own.question!.options[0].text = 'tampered'
  assert.notEqual(instance.question.options[0].text, 'tampered')
  catalog.questions.find(question => question.id === instance.question.id)!.prompt = 'catalog changed'
  assert.notEqual(instance.question.prompt, 'catalog changed')
})

test('answers enforce actor, instance, options and strict deadline without exposing correctness', () => {
  const catalog = content()
  const game = createGame(roster, catalog, 0, shortConfig)
  reachQuestion(game, catalog)
  const instance = game.rounds[0].questionInstances[0]
  assert.throws(() => answer(game, roster[0].id, 'a', 'stale', game.opensAt), rule('STALE_QUESTION'))
  assert.throws(() => answer(game, roster[0].id, 'a', instance.id, game.opensAt - 1), rule('ACTION_TOO_EARLY'))
  assert.throws(() => answer(game, roster[0].id, 'z', instance.id, game.opensAt), rule('INVALID_OPTION'))
  answer(game, roster[0].id, 'a', instance.id, game.opensAt + 100)
  assert.throws(() => answer(game, roster[0].id, 'b', instance.id, game.opensAt + 100), rule('ALREADY_ANSWERED'))
  const own = snapshot(game, roster[0].id, connected, game.opensAt + 100)
  const other = snapshot(game, roster[1].id, connected, game.opensAt + 100)
  assert.equal(own.selfAnswer, 'a')
  assert.equal(other.selfAnswer, null)
  assert.equal(other.answeredCount, 1)
  assert.equal(own.players[0].points, 0)
  assert.equal(own.players[0].roundPoints, 0)
  assert.equal(own.reveal, null)
  assert.throws(() => answer(game, roster[1].id, 'a', instance.id, game.deadline!), rule('ACTION_TOO_LATE'))
  answer(game, roster[1].id, 'b', instance.id, game.deadline! - 1)
  advance(game, catalog, connected, game.deadline! - 1)
  assert.equal(game.phase, 'round_reveal')
  assert.equal(game.players[0].points, 950)
  assert.equal(game.players[1].points, 0)
  assert.equal(snapshot(game, roster[0].id, connected, game.opensAt).reveal?.correctOptionId, 'a')
})

test('early closure uses the full configured duration and assigns each result once', () => {
  const catalog = content()
  const game = createGame(roster, catalog, 0, shortConfig)
  reachQuestion(game, catalog)
  const instance = game.rounds[0].questionInstances[0]
  const opensAt = game.opensAt
  answer(game, roster[0].id, 'a', instance.id, opensAt)
  answer(game, roster[1].id, 'a', instance.id, opensAt + 200)
  advance(game, catalog, connected, opensAt + 200)
  assert.equal(game.phase, 'round_reveal')
  assert.equal(game.players[0].points, 1000)
  assert.equal(game.players[1].points, 900)
  assert.equal(advance(game, catalog, connected, opensAt + 201), false)
  step(game, catalog)
  assert.equal(game.phase, 'scoreboard')
  assert.equal(game.players[0].points, 1000)
  assert.equal(game.rounds[0].questionInstances[0].answers[roster[0].id].points, 1000)
})

test('legacy games include five votes, never repeat a question, and end without a bonus or sixth round', () => {
  const catalog = content(5)
  const game = createGame(roster, catalog, 0, shortConfig)
  delete game.bonus
  reachVote(game, catalog)
  for (let round = 1; round <= 5; round++) {
    assert.equal(game.round, round)
    assert.equal(game.phase, 'category_vote')
    for (const player of roster) {
      const voting = snapshot(game, player.id, connected, game.opensAt)
      assert.equal(voting.categoryVotes, null)
      assert.equal(voting.categoryVoters, null)
      assert.equal(voting.selfVote, null)
    }
    reachQuestion(game, catalog)
    const instance = game.rounds.at(-1)!.questionInstances[0]
    answer(game, roster[0].id, 'a', instance.id, game.opensAt)
    answer(game, roster[1].id, 'a', instance.id, game.opensAt)
    advance(game, catalog, connected, game.opensAt)
    step(game, catalog)
    const tied = snapshot(game, roster[0].id, connected, game.opensAt)
    assert.deepEqual(tied.players.map(player => player.id), roster.map(player => player.id))
    assert.deepEqual(tied.players.map(player => player.rank), [1, 1])
    step(game, catalog)
    if (round < 5) {
      assert.equal(game.phase, 'round_ready')
      assert.equal(game.round, round)
      assert.equal(game.deadline, null)
      continueGame(game, roster[1].id, catalog, connected, round, 'round_ready', game.opensAt)
    }
  }
  assert.equal(game.phase, 'phase_complete')
  assert.equal(game.rounds.length, 5)
  assert.equal(new Set(game.usedQuestionIds).size, 5)
  assert.equal(game.players[0].points, 5000)
  assert.equal(game.deadline, null)
  assert.equal(advance(game, catalog, connected, game.opensAt + 100000), false)
})

test('temporary offline players remain expected until the deadline; next round waits for an explicit action after reconnection', () => {
  const catalog = content()
  const game = createGame(roster, catalog, 0, shortConfig)
  reachQuestion(game, catalog)
  const instance = game.rounds[0].questionInstances[0]
  answer(game, roster[0].id, 'a', instance.id, game.opensAt)
  const nobody = new Set<string>()
  assert.equal(advance(game, catalog, nobody, game.opensAt + 1), false)
  step(game, catalog, nobody)
  assert.equal(game.phase, 'round_reveal')
  assert.equal(game.players[0].points, 1000)
  step(game, catalog, nobody)
  step(game, catalog, nobody)
  assert.equal(game.phase, 'round_ready')
  assert.equal(game.round, 1)
  assert.equal(game.rounds.length, 1)
  assert.equal(game.deadline, null)
  assert.throws(() => continueGame(game, roster[0].id, catalog, new Set([roster[0].id]), 1, 'round_ready', game.opensAt + 1), rule('NOT_ENOUGH_PLAYERS'))
  assert.equal(advance(game, catalog, connected, game.opensAt + shortConfig.suspensionMs * 10), false)
  assert.equal(game.phase, 'round_ready')
  continueGame(game, roster[1].id, catalog, connected, 1, 'round_ready', game.opensAt + shortConfig.suspensionMs * 10)
  assert.equal(game.phase, 'category_vote')
  assert.equal(game.round, 2)
})

test('manual pauses interrupt only when retirement leaves fewer than two contenders, preserving every score', () => {
  for (const phase of ['intro', 'round_ready'] as const) {
    const catalog = content()
    const game = createGame(roster, catalog, 0, shortConfig)
    if (phase === 'intro') step(game, catalog)
    else {
      reachQuestion(game, catalog)
      const instance = game.rounds[0].questionInstances[0]
      answer(game, roster[0].id, 'a', instance.id, game.opensAt)
      answer(game, roster[1].id, 'a', instance.id, game.opensAt + 200)
      advance(game, catalog, connected, game.opensAt + 200)
      step(game, catalog)
      step(game, catalog)
    }
    assert.equal(game.phase, phase)
    const points = game.players.map(player => player.points)
    const nobody = new Set<string>()
    assert.equal(advance(game, catalog, nobody, game.opensAt + 100_000), false)
    assert.equal(game.phase, phase)
    retire(game, roster[0].id, game.opensAt + 100_001)
    assert.equal(advance(game, catalog, nobody, game.opensAt + 100_001), true)
    assert.equal(game.phase, 'aborted')
    assert.equal(game.deadline, null)
    assert.match(game.message!, /meno di 2 concorrenti/)
    assert.deepEqual(game.players.map(player => player.points), points)
    assert.equal(game.players[0].retired, true)
    assert.equal(advance(game, catalog, connected, game.opensAt + 100_002), false)
  }
})

test('retirement prevents future actions but preserves accepted submissions, scores and roster identity', () => {
  const catalog = content()
  const game = createGame(roster, catalog, 0, shortConfig)
  reachQuestion(game, catalog)
  const instance = game.rounds[0].questionInstances[0]
  answer(game, roster[0].id, 'a', instance.id, game.opensAt)
  retire(game, roster[0].id, game.opensAt)
  assert.throws(() => answer(game, roster[0].id, 'b', instance.id, game.opensAt), rule('NOT_IN_GAME'))
  answer(game, roster[1].id, 'b', instance.id, game.opensAt + 50)
  advance(game, catalog, connected, game.opensAt + 50)
  const state = snapshot(game, roster[1].id, connected, game.opensAt)
  assert.equal(state.players[0].points, 1000)
  assert.equal(state.players[0].retired, true)
  assert.equal(state.players[0].connected, false)
  assert.equal(game.players.length, 2)
  const version = game.version
  retire(game, roster[0].id, game.opensAt)
  assert.equal(game.version, version)
})

test('restart voids an exposed question, preserves audit, and resumes with a new question instance and clock', () => {
  const catalog = content()
  let game = createGame(roster, catalog, 0, shortConfig)
  reachQuestion(game, catalog)
  const original = game.rounds[0].questionInstances[0]
  answer(game, roster[0].id, 'a', original.id, game.opensAt)
  // Exactly the value a JSONB load produces; no Set, Date or class state needed.
  game = JSON.parse(JSON.stringify(game)) as GameState
  assert.equal(recoverGame(game, 5000), true)
  assert.equal(game.phase, 'suspended')
  assert.equal(game.rounds[0].questionInstances[0].status, 'voided')
  assert.equal(game.rounds[0].questionInstances[0].answers[roster[0].id].points, null)
  assert.equal(game.players[0].points, 0)
  assert.deepEqual(snapshot(game, roster[0].id, connected, 5000).categoryVoters, { animals: roster.map(player => player.id), art: [], history: [] })
  assert.equal(advance(game, catalog, new Set([roster[0].id]), 5001), false)
  assert.equal(advance(game, catalog, connected, 5002), true)
  assert.equal(game.phase, 'category_reveal')
  assert.equal(game.round, 1)
  assert.equal(game.rounds[0].category!.id, 'animals')
  const replacement = game.rounds[0].questionInstances[1]
  assert.notEqual(replacement.id, original.id)
  assert.notEqual(replacement.question.id, original.question.id)
  assert.equal(snapshot(game, roster[0].id, connected, 5002).selfAnswer, null)
  step(game, catalog)
  assert.equal(game.deadline! - game.opensAt, shortConfig.questionMs)
  assert.throws(() => answer(game, roster[1].id, 'a', original.id, game.opensAt), rule('STALE_QUESTION'))
  answer(game, roster[1].id, 'a', replacement.id, game.opensAt)
  step(game, catalog)
  assert.equal(game.players[0].points, 0)
  assert.equal(game.players[1].points, 1000)
})

test('restart during a vote preserves accepted votes and restarts one common voting window', () => {
  const catalog = content()
  const game = createGame(roster, catalog, 0, shortConfig)
  reachVote(game, catalog)
  vote(game, roster[0].id, 'art', game.opensAt)
  recoverGame(game, 5000)
  for (const player of roster) assert.equal(snapshot(game, player.id, connected, 5000).categoryVoters, null)
  advance(game, catalog, connected, 5001)
  assert.equal(game.phase, 'category_vote')
  assert.equal(game.deadline, 5001 + shortConfig.voteMs)
  assert.equal(snapshot(game, roster[0].id, connected, 5001).selfVote, 'art')
  for (const player of roster) assert.equal(snapshot(game, player.id, connected, 5001).categoryVoters, null)
  assert.throws(() => vote(game, roster[0].id, 'history', 5001), rule('ALREADY_VOTED'))
  vote(game, roster[1].id, 'art', 5001)
  advance(game, catalog, connected, 5001)
  assert.equal(game.rounds[0].category!.id, 'art')
  assert.deepEqual(snapshot(game, roster[0].id, connected, 5001).categoryVoters, { animals: [], art: roster.map(player => player.id), history: [] })
})

test('recovery preserves revealed points, and suspension expiry interrupts without creating results', () => {
  const catalog = content()
  const game = createGame(roster, catalog, 0, shortConfig)
  reachQuestion(game, catalog)
  const instance = game.rounds[0].questionInstances[0]
  answer(game, roster[0].id, 'a', instance.id, game.opensAt)
  step(game, catalog)
  assert.equal(game.players[0].points, 1000)
  recoverGame(game, 5000)
  assert.equal(game.phase, 'suspended')
  assert.equal(advance(game, catalog, connected, game.deadline!), true)
  assert.equal(game.phase, 'aborted')
  assert.equal(game.players[0].points, 1000)
  assert.equal(instance.status, 'revealed')
})

test('lack of a replacement produces an explicit interruption and never reuses an exposed question', () => {
  const catalog = content(5)
  const game = createGame(roster, catalog, 0, shortConfig)
  reachQuestion(game, catalog)
  recoverGame(game, 5000)
  const original = game.rounds[0].questionInstances[0]
  const depleted = { ...catalog, questions: catalog.questions.filter(question => question.categoryId !== 'animals' || question.id === original.question.id) }
  advance(game, depleted, connected, 5001)
  assert.equal(game.phase, 'aborted')
  assert.match(game.message!, /altre domande/)
  assert.equal(game.rounds[0].questionInstances.length, 1)
  assert.equal(original.status, 'voided')
})
