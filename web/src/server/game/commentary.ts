import { TEXTS } from '../../texts'

type AnswerResult = 'correct' | 'wrong' | 'missing'

export interface JerryCommentaryContext {
  round: number
  totalRounds: number
  players: Array<{
    id: string
    nickname: string
    pointsBefore: number
    pointsAfter: number
    retired: boolean
    answer: AnswerResult
    previousAnswer: AnswerResult | null
  }>
}

export function buildJerryCommentary({ round, totalRounds, players }: JerryCommentaryContext): string[] {
  const active = players.filter(player => !player.retired)
  if (active.length === 0) return []

  const lines: string[] = []
  const pick = <T,>(variants: readonly T[]) => variants[(round - 1) % variants.length]
  const highestBefore = Math.max(...active.map(player => player.pointsBefore))
  const lowestBefore = Math.min(...active.map(player => player.pointsBefore))
  const highestAfter = Math.max(...active.map(player => player.pointsAfter))
  const previousLeaders = active.filter(player => player.pointsBefore === highestBefore)
  const previousLeader = previousLeaders.length === 1 ? previousLeaders[0] : null

  if (round > 1 && previousLeader && previousLeader.pointsAfter < highestAfter) {
    const newLeader = active.find(player => player.pointsAfter === highestAfter)!
    lines.push(pick(TEXTS.commentary.newLeader)(newLeader.nickname, previousLeader.nickname))
  }

  const correctCount = active.filter(player => player.answer === 'correct').length
  if (correctCount === 0) {
    lines.push(pick(TEXTS.commentary.nobodyCorrect))
  } else if (correctCount === active.length) {
    lines.push(pick(TEXTS.commentary.everyoneCorrect))
  }

  if (round > 1 && lowestBefore < highestBefore && lines.length < 2) {
    const repeatedMiss = active.find(player => player.pointsBefore === lowestBefore && player.answer === 'wrong' && player.previousAnswer === 'wrong')
    if (repeatedMiss) {
      lines.push(pick(TEXTS.commentary.repeatedMiss)(repeatedMiss.nickname))
    }
  }

  if (lines.length === 0) {
    lines.push(round === totalRounds ? TEXTS.commentary.phaseEnd : pick(TEXTS.commentary.roundEnd))
  }

  return lines.slice(0, 2)
}
