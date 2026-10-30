/** Rules and trajectory shared by the coordinator and every phone. */
export type WheelSliceKind = 'minigame' | 'flash_all' | 'flash_self' | 'plus' | 'minus' | 'double' | 'half'

const SLICE_COUNTS: Record<WheelSliceKind, number> = { minigame: 17, flash_all: 2, flash_self: 3, plus: 9, minus: 7, double: 1, half: 1 }

/** Same kinds stay spread around the rim: each one claims evenly spaced positions. */
function spreadSlices(): WheelSliceKind[] {
  const total = Object.values(SLICE_COUNTS).reduce((sum, count) => sum + count, 0)
  return (Object.entries(SLICE_COUNTS) as [WheelSliceKind, number][])
    .flatMap(([kind, count]) => Array.from({ length: count }, (_, index) => ({ kind, position: (index + .5) / count * total })))
    .sort((left, right) => left.position - right.position || left.kind.localeCompare(right.kind))
    .map(slice => slice.kind)
}

export const WHEEL_SLICES: readonly WheelSliceKind[] = spreadSlices()
export const SLICE_DEGREES = 360 / WHEEL_SLICES.length

export const MIN_TOTAL_SPINS = 8
export const turnsPerPlayer = (players: number) => Math.ceil(MIN_TOTAL_SPINS / players)

export const SPIN_MIN_MS = 3_000
export const SPIN_MAX_MS = 6_000
const SPIN_DECAY = 3.2

export interface SpinTrajectory { startedAt: number; durationMs: number; finalAngle: number }

/**
 * Strength only shapes the show, from -1 to 1: its sign is the direction of the
 * swipe and its size the power. The slice is drawn before this is called.
 */
export function spinTrajectory(sliceIndex: number, strength: number, startedAt: number, offsetInSlice = 0): SpinTrajectory {
  const power = Math.min(1, Math.abs(strength))
  const direction = strength < 0 ? -1 : 1
  const landing = -(sliceIndex + .5) * SLICE_DEGREES + offsetInSlice * SLICE_DEGREES * .4
  const turns = (3 + Math.round(power * 4)) * 360
  return { startedAt, durationMs: Math.round(SPIN_MIN_MS + (SPIN_MAX_MS - SPIN_MIN_MS) * power), finalAngle: landing + direction * turns }
}

/** The angle depends only on the clock, so phones agree and rejoiners land mid-spin. */
export function spinAngle(trajectory: SpinTrajectory, now: number): number {
  const progress = Math.max(0, Math.min(1, (now - trajectory.startedAt) / trajectory.durationMs))
  return trajectory.finalAngle * (1 - (1 - progress) ** SPIN_DECAY)
}

/** Slice under the top pointer, for any rotation. */
export function sliceAtAngle(angle: number): number {
  const normalized = ((360 - angle) % 360 + 360) % 360
  return Math.floor(normalized / SLICE_DEGREES) % WHEEL_SLICES.length
}

export type MinigameKind = 'timer' | 'numbers' | 'balloon' | 'chests' | 'highest' | 'bomb'

export type MinigameView =
  | { kind: 'timer'; targetMs: number; hideAfterMs: number; selfElapsedMs: number | null; stoppedCount: number }
  | { kind: 'numbers'; grid: number[]; selfFinishedMs: number | null; finishedCount: number }
  | { kind: 'balloon'; pumps: number; status: 'pumping' | 'popped'; poppedCount: number }
  | { kind: 'chests'; chests: number[]; selfPick: number | null; pickedCount: number }
  | { kind: 'highest'; max: number; selfPick: number | null; pickedCount: number }
  | { kind: 'bomb'; holderId: string; blockedId: string | null; blastsDone: number; totalBlasts: number; lastBlastId: string | null; selfHits: number }

export interface MinigameResult {
  playerId: string
  rank: number
  points: number
  /** Scarto, tempo, pompate, valore del forziere, numero o esplosioni, secondo il minigioco. */
  detail: number | null
}

export interface MinigameSnapshot {
  runId: string
  kind: MinigameKind
  participantIds: string[]
  confirmedIds: string[]
  view: MinigameView | null
  results: MinigameResult[] | null
  /** Palloncino: limite segreto svelato alla chiusura; Stoppa il timer: obiettivo. */
  revealValue: number | null
  lastActionId: string | null
}

export interface FlashSnapshot {
  id: string
  scope: 'all' | 'self'
  playerId: string
  category: string
  participantCount: number
  answeredCount: number
  canAnswer: boolean
  selfAnswer: string | null
  question: { prompt: string; options: { id: string; text: string }[] } | null
  reveal: { correctOptionId: string; points: Record<string, number>; sourceName: string; sourceUrl: string; license: string } | null
}

export interface WheelSpinSnapshot {
  id: string
  playerId: string
  sliceIndex: number
  slice: WheelSliceKind
  trajectory: SpinTrajectory
  pointsBefore: number
  pointsAfter: number
  auto: boolean
}

export interface WheelSnapshot {
  turnId: string
  spinNumber: number
  totalSpins: number
  spinnerId: string | null
  spin: WheelSpinSnapshot | null
  commentary: string | null
  minigame: MinigameSnapshot | null
  flash: FlashSnapshot | null
}
