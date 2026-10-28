import type { AvatarId } from '../rooms/data/avatars'
import type { PowerCard, PowerEffect } from './powers'

export type GameContinuePhase = 'intro' | 'round_ready' | 'bonus_intro' | 'bonus_results'
export type GamePhase = 'countdown' | GameContinuePhase | 'category_vote' | 'category_reveal' | 'question' | 'bonus_playing' | 'round_reveal' | 'scoreboard' | 'phase_complete' | 'suspended' | 'aborted'

export interface GameCategory { id: string; name: string; icon?: string }
export interface GameOption { id: string; text: string }
export interface GamePlayer {
  id: string
  nickname: string
  avatarId: AvatarId
  points: number
  roundPoints: number
  triviaPoints?: number
  bonusPoints?: number
  rank: number
  connected: boolean
  retired: boolean
}

export interface BonusResult {
  playerId: string
  rank: number
  chain: number
  completedMs: number | null
  bonusPoints: number
  triviaPoints: number
  totalPoints: number
  retired: boolean
}

export interface BonusSnapshot {
  runId: string
  target: number
  questionMs: number
  participantCount: number
  completedCount: number
  startedAt: number | null
  chain: number
  question: { instanceId: string; prompt: string; options: GameOption[] } | null
  questionDeadline: number | null
  completedMs: number | null
  lastConsumedInstanceId: string | null
  lastOutcome: 'advanced' | 'reset' | 'timeout' | null
  results: BonusResult[] | null
}

export interface GameSnapshot {
  id: string
  phase: GamePhase
  round: number
  totalRounds: number
  version: number
  serverNow: number
  opensAt: number
  deadline: number | null
  players: GamePlayer[]
  candidates: GameCategory[]
  category: GameCategory | null
  categoryVotes: Record<string, number> | null
  categoryVoters: Record<string, string[]> | null
  selectionReason: 'votes' | 'tie' | 'abstention' | null
  question: { id: string; instanceId: string; prompt: string; options: GameOption[]; language: string } | null
  selfVote: string | null
  selfAnswer: string | null
  answeredCount: number
  votedCount: number
  reveal: { correctOptionId: string; explanation?: string; sourceName: string; sourceUrl: string; license: string } | null
  message: string | null
  commentary: string[]
  bonus?: BonusSnapshot | null
  powers: {
    inventory: PowerCard[]
    effect: PowerEffect | null
    used: boolean
    ready: boolean
    readyCount: number
    preparationId: string | null
    targetedIds: string[]
  }
}

export type GameAction = 'game:start' | 'game:continue' | 'game:vote-category' | 'game:answer' | 'game:bonus-answer' | 'game:use-power' | 'game:ready-question' | 'game:clear-power' | 'game:resume' | 'game:return-lobby'
export interface GameCommandFields {
  roomId?: string
  matchId?: string
  roundId?: number
  expectedPhase?: GameContinuePhase
  questionInstanceId?: string
  bonusRunId?: string
  categoryId?: string
  optionId?: string
  powerCardId?: string
  targetId?: string
  /** Retained only to recognize receipts from the retired lock power. */
  powerStep?: number
}

export const GAME_DEFAULTS = {
  rounds: 5,
  countdownMs: 5_000,
  voteMs: 12_000,
  categoryRevealMs: 15_000,
  questionMs: 15_000,
  roundRevealMs: 5_000,
  scoreboardMs: 5_000,
  suspensionMs: 90_000,
  basePoints: 500,
  speedPoints: 500,
} as const

export type GameConfig = { [K in keyof typeof GAME_DEFAULTS]: number }
