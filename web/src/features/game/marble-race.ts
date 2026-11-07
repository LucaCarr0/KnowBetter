/** Crazy Bet: rules and race geometry shared by the coordinator and every phone. */
export const BET_MS = 30_000
export const GATE_MS = 3_000
export const RACE_CAP_MS = 45_000
export const OUTRO_MS = 4_000
export const MIN_BET = 50
/** Who has fewer points can still stake this much: the board never goes below zero. */
export const HOUSE_STAKE = 200
export const FRAME_MS = 1000 / 30
/** Track coordinates are hundredths of a metre in 16-bit integers. */
export const TRACK_SCALE = 100
export const ROTOR_THICKNESS = .18
export const DOOR_THICKNESS = .2

export type RaceShape =
  /** A static polyline: x0, y0, x1, y1… */
  | { kind: 'wall'; points: number[] }
  | { kind: 'peg'; x: number; y: number; r: number }
  | { kind: 'bumper'; x: number; y: number; r: number }
  /** `arms` bars cross at the centre; each reaches `length` on both sides. */
  | { kind: 'rotor'; x: number; y: number; length: number; arms: number; speed: number; phase: number }
  /** Hinged at (x, y); `side` 1 opens to the right of the hinge, -1 to the left. */
  | { kind: 'door'; x: number; y: number; length: number; side: 1 | -1; periodS: number; phaseS: number }

/** Metres, with y growing downwards like the screen. */
export interface RaceCourse {
  width: number
  height: number
  marbleRadius: number
  finishY: number
  /** Start positions by slot: x0, y0, x1, y1… */
  starts: number[]
  shapes: RaceShape[]
}

export interface MarbleBet { marbleId: string; amount: number }

export interface MarbleRaceReveal {
  /** Marble ids by start position. */
  slots: string[]
  /** Offset from the start of the minigame, like every time in the view. */
  startOffsetMs: number
  durationMs: number
  /** Base64 of 16-bit pairs per frame and slot. */
  track: string
  /** By slot; null for a marble still on the course when time ran out. */
  finishMs: (number | null)[]
  /** Marble ids from first to last. */
  order: string[]
  bets: Record<string, MarbleBet>
}

export const maxStake = (points: number) => Math.max(points, HOUSE_STAKE)

/** From +stake for the first marble to -stake for the last, in proportion. */
export function betPayout(stake: number, position: number, marbles: number): number {
  return marbles > 1 ? Math.round(stake * (1 - 2 * (position - 1) / (marbles - 1))) : stake
}

export const rotorAngle = (shape: Extract<RaceShape, { kind: 'rotor' }>, seconds: number) => shape.phase + shape.speed * seconds

const DOOR_OPEN_ANGLE = 1.35
// Fractions of the period: shut, swinging open, open, swinging shut.
const DOOR_SHUT = .55
const DOOR_SWING = .12
const DOOR_OPEN = .21

export function doorAngle(shape: Extract<RaceShape, { kind: 'door' }>, seconds: number): number {
  const cycle = ((seconds + shape.phaseS) % shape.periodS + shape.periodS) % shape.periodS / shape.periodS
  const opening = cycle < DOOR_SHUT ? 0
    : cycle < DOOR_SHUT + DOOR_SWING ? (cycle - DOOR_SHUT) / DOOR_SWING
      : cycle < DOOR_SHUT + DOOR_SWING + DOOR_OPEN ? 1
        : Math.max(0, 1 - (cycle - DOOR_SHUT - DOOR_SWING - DOOR_OPEN) / DOOR_SWING)
  return shape.side * DOOR_OPEN_ANGLE * opening * opening * (3 - 2 * opening)
}

export function decodeTrack(track: string): Int16Array {
  const bytes = Uint8Array.from(atob(track), char => char.charCodeAt(0))
  return new Int16Array(bytes.buffer)
}

/** Position of a slot at a race time, between recorded frames. */
export function marbleAt(track: Int16Array, marbles: number, slot: number, raceMs: number): [number, number] {
  const frames = track.length / (marbles * 2)
  const at = Math.max(0, Math.min(frames - 1, raceMs / FRAME_MS))
  const from = Math.floor(at)
  const to = Math.min(frames - 1, from + 1)
  const blend = at - from
  const coordinate = (frame: number, axis: number) => track[(frame * marbles + slot) * 2 + axis] / TRACK_SCALE
  return [0, 1].map(axis => coordinate(from, axis) + (coordinate(to, axis) - coordinate(from, axis)) * blend) as [number, number]
}

/** Live positions: arrived marbles by arrival, the others by depth. */
export function liveOrder(track: Int16Array, finishMs: (number | null)[], raceMs: number): number[] {
  const depth = finishMs.map((_, slot) => marbleAt(track, finishMs.length, slot, raceMs)[1])
  const arrived = (slot: number) => finishMs[slot] !== null && finishMs[slot]! <= raceMs
  return finishMs.map((_, slot) => slot).sort((left, right) => arrived(left) !== arrived(right) ? (arrived(left) ? -1 : 1)
    : arrived(left) ? finishMs[left]! - finishMs[right]! : depth[right] - depth[left])
}
