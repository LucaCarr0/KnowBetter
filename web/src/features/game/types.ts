import type { AvatarId } from '../rooms/data/avatars'
import type { PowerCard, PowerEffect } from './powers'
import type { WheelSnapshot } from './wheel'

export const GAME_CONTINUE_PHASES = ['intro', 'round_ready', 'bonus_intro', 'bonus_results', 'phase1_summary', 'wheel_intro', 'wheel_summary'] as const
export type GameContinuePhase = typeof GAME_CONTINUE_PHASES[number]
export type GamePhase = 'countdown' | GameContinuePhase | 'category_vote' | 'category_reveal' | 'question' | 'bonus_playing' | 'round_reveal' | 'scoreboard' | 'phase_complete' | 'suspended' | 'aborted'
  | 'wheel_turn' | 'wheel_spin' | 'wheel_effect' | 'minigame_intro' | 'minigame_playing' | 'minigame_results' | 'flash_intro' | 'flash_question' | 'flash_reveal'

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
  /** Variazione della Fase 2, che può essere negativa. */
  wheelDelta?: number
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
  wheel?: WheelSnapshot | null
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

export type GameDevTarget = 'bonus' | 'wheel' | 'bet'
export type GameAction = 'game:start' | 'game:continue' | 'game:vote-category' | 'game:answer' | 'game:bonus-answer' | 'game:spin' | 'game:minigame-confirm' | 'game:minigame-action' | 'game:flash-answer' | 'game:dev-skip' | 'game:use-power' | 'game:ready-question' | 'game:clear-power' | 'game:resume' | 'game:return-lobby'
export interface GameCommandFields {
  roomId?: string
  matchId?: string
  roundId?: number
  expectedPhase?: GameContinuePhase
  questionInstanceId?: string
  bonusRunId?: string
  turnId?: string
  /** Forza dello swipe, da 0 a 1: cambia l'animazione, mai lo spicchio. */
  spinStrength?: number
  minigameRunId?: string
  actionId?: string
  minigameAction?: Record<string, unknown>
  flashId?: string
  devTarget?: GameDevTarget
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
  wheelTurnMs: 15_000,
  wheelEffectMs: 5_000,
  minigamePreviewMs: 45_000,
  minigameResultsMs: 5_000,
  flashIntroMs: 3_000,
  flashRevealMs: 5_000,
} as const

export type GameConfig = { [K in keyof typeof GAME_DEFAULTS]: number }
