import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildJerryCommentary, type JerryCommentaryContext } from './commentary'

type Player = JerryCommentaryContext['players'][number]

function player(id: string, changes: Partial<Player> = {}): Player {
  return { id, nickname: id, pointsBefore: 0, pointsAfter: 0, retired: false, answer: 'wrong', previousAnswer: null, ...changes }
}

function commentary(players: Player[], round = 2, totalRounds = 5): string[] {
  return buildJerryCommentary({ round, totalRounds, players })
}

test('Jerry names both players when the sole previous leader loses first place', () => {
  const lines = commentary([
    player('Ada', { pointsBefore: 1000, pointsAfter: 1000 }),
    player('Bruno', { pointsBefore: 700, pointsAfter: 1500, answer: 'correct' }),
  ])
  assert.equal(lines.length, 1)
  assert.match(lines[0], /Ada/)
  assert.match(lines[0], /Bruno/)
  assert.match(lines[0], /vetta/)
})

test('ties at the start and a previous leader still tied for first do not count as dethroning', () => {
  for (const players of [
    [player('Ada', { pointsAfter: 500, answer: 'correct' }), player('Bruno')],
    [player('Ada', { pointsBefore: 1000, pointsAfter: 1000 }), player('Bruno', { pointsBefore: 500, pointsAfter: 1000, answer: 'correct' })],
    [player('Ada', { pointsBefore: 1000, pointsAfter: 1000 }), player('Bruno', { pointsBefore: 1000, pointsAfter: 1500, answer: 'correct' })],
  ]) {
    assert.doesNotMatch(commentary(players).join(' '), /Ada|Bruno/)
  }
})

test('the first round never invents a previous leader or a repeat error', () => {
  const lines = commentary([
    player('Ada', { pointsBefore: 1000, pointsAfter: 1000 }),
    player('Bruno', { pointsBefore: 500, pointsAfter: 1500, answer: 'correct' }),
    player('Carlo', { pointsBefore: 100, pointsAfter: 100, previousAnswer: 'wrong' }),
  ], 1)
  assert.equal(lines.length, 1)
  assert.doesNotMatch(lines.join(' '), /Ada|Bruno|Carlo/)
})

test('nobody correct and everybody correct get different collective comments', () => {
  assert.match(commentary([player('Ada'), player('Bruno', { answer: 'missing' })], 1)[0], /Nessuna risposta giusta/)
  assert.match(commentary([player('Ada', { answer: 'correct' }), player('Bruno', { answer: 'correct' })], 1)[0], /Tutti hanno indovinato/)
  assert.doesNotMatch(commentary([player('Ada', { answer: 'correct' }), player('Bruno', { answer: 'missing' })], 1)[0], /Tutti hanno indovinato/)
})

test('Jerry teases the previous last place only for two explicit wrong answers', () => {
  const leader = player('Ada', { pointsBefore: 1000, pointsAfter: 1500, answer: 'correct' })
  const last = player('Bruno', { pointsBefore: 500, pointsAfter: 500, previousAnswer: 'wrong' })
  assert.match(commentary([leader, last])[0], /Bruno sbaglia ancora dal fondo/)
  for (const changes of [
    { answer: 'missing' as const },
    { answer: 'correct' as const },
    { previousAnswer: 'missing' as const },
    { previousAnswer: 'correct' as const },
    { previousAnswer: null },
  ]) {
    assert.doesNotMatch(commentary([leader, { ...last, ...changes }]).join(' '), /Bruno/)
  }
})

test('last place ties can name a repeat miss, but a fully tied table has no last-place target', () => {
  assert.match(commentary([
    player('Ada', { pointsBefore: 1000, pointsAfter: 1500, answer: 'correct' }),
    player('Bruno', { previousAnswer: 'wrong' }),
    player('Carlo', { previousAnswer: 'wrong' }),
  ])[0], /Bruno/)
  assert.doesNotMatch(commentary([
    player('Ada', { pointsAfter: 500, answer: 'correct' }),
    player('Bruno', { previousAnswer: 'wrong' }),
  ])[0], /Bruno/)
})

test('retired players affect neither leadership, collective results nor repeat misses', () => {
  assert.match(commentary([
    player('Ada', { pointsBefore: 1000, pointsAfter: 1500, answer: 'correct' }),
    player('Bruno', { pointsBefore: 2000, pointsAfter: 2000, retired: true, previousAnswer: 'wrong' }),
    player('Carlo', { retired: true, previousAnswer: 'wrong' }),
  ], 1)[0], /Tutti hanno indovinato/)
  assert.deepEqual(commentary([player('Ada', { retired: true })]), [])
})

test('commentary keeps event priority and never exceeds two lines', () => {
  const lines = commentary([
    player('Ada', { pointsBefore: 1000, pointsAfter: 1000 }),
    player('Bruno', { pointsBefore: 700, pointsAfter: 1500, answer: 'correct' }),
    player('Carlo', { pointsBefore: 100, pointsAfter: 100, previousAnswer: 'wrong' }),
  ])
  assert.equal(lines.length, 2)
  assert.match(lines[0], /Ada.*Bruno/)
  assert.match(lines[1], /Carlo/)
  const collective = commentary([
    player('Ada', { pointsBefore: 1000, pointsAfter: 1000 }),
    player('Bruno', { pointsBefore: 500, pointsAfter: 500, previousAnswer: 'wrong' }),
  ])
  assert.equal(collective.length, 2)
  assert.match(collective[0], /Zero risposte giuste/)
  assert.match(collective[1], /Bruno/)
})

test('the same state yields identical text without mutation and variants change each round', () => {
  const context: JerryCommentaryContext = { round: 2, totalRounds: 5, players: [player('Ada'), player('Bruno')] }
  const original = JSON.stringify(context)
  assert.deepEqual(buildJerryCommentary(context), buildJerryCommentary(context))
  assert.equal(JSON.stringify(context), original)
  const variants = Array.from({ length: 5 }, (_, index) => commentary(context.players, index + 1)[0])
  assert.equal(new Set(variants).size, 5)
})

test('nicknames remain plain text and final fallback does not declare a match winner', () => {
  const nickname = '<img src=x onerror=alert(1)> & Jerry'
  const lines = commentary([
    player('Ada', { pointsBefore: 1000, pointsAfter: 1500, answer: 'correct' }),
    player('Bruno', { nickname, previousAnswer: 'wrong' }),
  ])
  assert.ok(lines[0].includes(nickname))
  assert.doesNotMatch(lines[0], /&lt;|&amp;/)
  const final = commentary([player('Ada', { answer: 'correct' }), player('Bruno')], 5)
  assert.match(final[0], /Fase conclusa/)
  assert.doesNotMatch(final[0], /vincitore|vince|vittoria/i)
})
