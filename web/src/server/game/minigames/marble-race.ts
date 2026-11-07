import { Box, Circle, Edge, World, type Body } from 'planck'
import { DOOR_THICKNESS, RACE_CAP_MS, ROTOR_THICKNESS, TRACK_SCALE, decodeTrack, doorAngle, liveOrder, rotorAngle, type RaceCourse, type RaceShape } from '../../../features/game/marble-race'

/** Crazy Bet race: a course built from a seed and one physics run on the coordinator. */
export interface RaceRun {
  /** Base64 of 16-bit x, y per slot, one frame every two steps. */
  track: string
  finishMs: (number | null)[]
  durationMs: number
  /** Slots from first to last. */
  order: number[]
}

const WIDTH = 9
const RADIUS = .36
const GRAVITY = 9
const STEP_S = 1 / 60
const STEPS_PER_FRAME = 2
const MAX_SPEED = 15
const STALL_SPEED = .25
/** Longer than a trapdoor stays shut, so waiting marbles are not kicked. */
const STALL_MS = 2_500
const SETTLE_MS = 1_000
const BUMPER_RESTITUTION = 1.15
const SECTIONS_PER_RACE = 4
const CACHE_SIZE = 8

type Random = () => number
type Section = (random: Random, top: number) => { shapes: RaceShape[]; height: number }

/** Mulberry32: the same seed rebuilds the same course and the same nudges. */
function generator(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = Math.imul(state ^ state >>> 15, state | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

const between = (random: Random, min: number, max: number) => min + random() * (max - min)
const sign = (random: Random) => random() < .5 ? -1 : 1
/** Course numbers are rounded once, so the phones draw exactly what was simulated. */
const r2 = (value: number) => Math.round(value * 100) / 100

/** Sloped teeth on both walls push marbles back into play: a free lane by the wall would be a fast lane. */
const teeth = (y: number): RaceShape[] => [
  { kind: 'wall', points: [0, r2(y - .3), .55, r2(y), 0, r2(y + .3)] },
  { kind: 'wall', points: [WIDTH, r2(y - .3), WIDTH - .55, r2(y), WIDTH, r2(y + .3)] },
]

// Every section keeps at least 1 m free at its bottom: moving parts never pinch a marble against the next one.
const SECTIONS: Record<string, Section> = {
  pegs(random, top) {
    const rows = 6 + Math.floor(random() * 3)
    const shapes: RaceShape[] = []
    for (let row = 0; row < rows; row++) {
      const y = top + .8 + row * 1.15
      for (let x = row % 2 ? 1.5 : 2.25; x < WIDTH - 1; x += 1.5) shapes.push({ kind: 'peg', x: r2(x + between(random, -.12, .12)), y: r2(y), r: .13 })
      // Teeth instead of pegs by the walls: a marble could rest between a peg and the wall.
      if (row % 2 === 0) shapes.push(...teeth(y))
    }
    return { shapes, height: .8 + (rows - 1) * 1.15 + 1.2 }
  },
  rotors(random, top) {
    const rows = [[2.45, 6.55], [4.5], [2.45, 6.55]]
    const shapes: RaceShape[] = rows.flatMap((xs, row) => [...teeth(top + .2 + row * 3), ...xs.map(x => ({
      kind: 'rotor' as const, x, y: r2(top + 1.6 + row * 3), length: 1.3, arms: random() < .5 ? 2 : 3,
      speed: r2(sign(random) * between(random, 1.6, 3)), phase: r2(random() * Math.PI),
    }))])
    return { shapes, height: 1.6 + 6 + 1.3 + 1.1 }
  },
  zigzag(random, top) {
    const first = random() < .5 ? 0 : 1
    const holed = Math.floor(random() * 3)
    const shapes: RaceShape[] = []
    // Room enough at each drop that three marbles cannot wedge between a ramp end, the wall and the next ramp.
    for (let ramp = 0; ramp < 3; ramp++) {
      const y = top + .8 + ramp * 3.2
      const [from, to] = (ramp + first) % 2 ? [WIDTH, 1.8] : [0, WIDTH - 1.8]
      const at = (share: number) => [r2(from + (to - from) * share), r2(y + 1.9 * share)]
      if (ramp !== holed) { shapes.push({ kind: 'wall', points: [...at(0), ...at(1)] }); continue }
      // A shortcut: the hole drops whoever rolls over it onto the next ramp.
      const hole = between(random, .3, .6)
      shapes.push({ kind: 'wall', points: [...at(0), ...at(hole)] }, { kind: 'wall', points: [...at(hole + 1.15 / Math.abs(to - from)), ...at(1)] })
    }
    return { shapes, height: .8 + 2 * 3.2 + 1.9 + 1.1 }
  },
  funnel(random, top) {
    const neck = r2(between(random, 2.6, 3.2))
    const left = r2((WIDTH - neck) / 2)
    const bottom = top + 4.2
    return {
      shapes: [
        { kind: 'wall', points: [0, r2(top + .6), left, r2(bottom), left, r2(bottom + .8)] },
        { kind: 'wall', points: [WIDTH, r2(top + .6), r2(WIDTH - left), r2(bottom), r2(WIDTH - left), r2(bottom + .8)] },
        { kind: 'rotor', x: WIDTH / 2, y: r2(bottom - .9), length: .5, arms: 2, speed: r2(sign(random) * 4), phase: 0 },
      ],
      height: 4.2 + .8 + 1.1,
    }
  },
  bumpers(random, top) {
    const rows = [[2, 4.5, 7], [3.25, 5.75], [2, 4.5, 7]]
    const shapes: RaceShape[] = rows.flatMap((xs, row) => [...row < 2 ? teeth(top + 2.45 + row * 2.1) : [], ...xs.map(x => ({
      kind: 'bumper' as const, x: r2(x + between(random, -.2, .2)), y: r2(top + 1.4 + row * 2.1), r: r2(between(random, .45, .6)),
    }))])
    return { shapes, height: 1.4 + 4.2 + .6 + 1.1 }
  },
  trapdoor(random, top) {
    const periodS = r2(between(random, 2.8, 3.6))
    const phaseS = r2(random() * periodS)
    const length = WIDTH / 2 - .15
    const y = r2(top + 1.2)
    return {
      shapes: [
        { kind: 'door', x: 0, y, length, side: 1, periodS, phaseS },
        { kind: 'door', x: WIDTH, y, length, side: -1, periodS, phaseS },
      ],
      height: 1.2 + 4.4 + 1.1,
    }
  },
}

function shuffle<T>(random: Random, items: readonly T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

/** Start row, four random sections, a funnel into the finishing straight and a tray. */
export function generateCourse(seed: number, marbles: number): RaceCourse {
  const random = generator(seed)
  const starts = Array.from({ length: marbles }, (_, slot) => [
    r2(WIDTH / 2 + (slot - (marbles - 1) / 2) * .85 + between(random, -.06, .06)), r2(.9 + between(random, -.05, .05)),
  ]).flat()
  const shapes: RaceShape[] = []
  let top = 2
  for (const kind of shuffle(random, Object.keys(SECTIONS)).slice(0, SECTIONS_PER_RACE)) {
    const section = SECTIONS[kind](random, top)
    shapes.push(...section.shapes)
    top = r2(top + section.height)
  }
  const channel = (WIDTH - 2.4) / 2
  const height = r2(top + 9.5)
  shapes.push(
    { kind: 'wall', points: [0, r2(top + .4), channel, r2(top + 3.7), channel, r2(top + 7.5)] },
    { kind: 'wall', points: [WIDTH, r2(top + .4), WIDTH - channel, r2(top + 3.7), WIDTH - channel, r2(top + 7.5)] },
    { kind: 'wall', points: [0, height, 0, 0, WIDTH, 0, WIDTH, height, 0, height] },
  )
  return { width: WIDTH, height, marbleRadius: RADIUS, finishY: r2(top + 6), starts, shapes }
}

/** Pure: the same course and seed give the same race, frame by frame. */
export function simulateRace(course: RaceCourse, seed: number): RaceRun {
  const random = generator(seed ^ 0x5BD1E995)
  const world = new World({ gravity: { x: 0, y: GRAVITY } })
  const ground = world.createBody()
  const movers: { body: Body; angle: (seconds: number) => number }[] = []
  for (const shape of course.shapes) {
    if (shape.kind === 'wall') {
      for (let index = 2; index < shape.points.length; index += 2) {
        const edge = new Edge({ x: shape.points[index - 2], y: shape.points[index - 1] }, { x: shape.points[index], y: shape.points[index + 1] })
        ground.createFixture(edge, { friction: .2, restitution: .2 })
      }
    } else if (shape.kind === 'peg') ground.createFixture(new Circle({ x: shape.x, y: shape.y }, shape.r), { friction: .1, restitution: .45 })
    else if (shape.kind === 'bumper') ground.createFixture(new Circle({ x: shape.x, y: shape.y }, shape.r), { friction: .1, restitution: BUMPER_RESTITUTION })
    else if (shape.kind === 'rotor') {
      const body = world.createKinematicBody({ x: shape.x, y: shape.y }, rotorAngle(shape, 0))
      for (let arm = 0; arm < shape.arms; arm++) body.createFixture(new Box(shape.length, ROTOR_THICKNESS / 2, { x: 0, y: 0 }, arm * Math.PI / shape.arms), { friction: .3, restitution: .3 })
      movers.push({ body, angle: seconds => rotorAngle(shape, seconds) })
    } else {
      const body = world.createKinematicBody({ x: shape.x, y: shape.y }, doorAngle(shape, 0))
      body.createFixture(new Box(shape.length / 2, DOOR_THICKNESS / 2, { x: shape.side * shape.length / 2, y: 0 }, 0), { friction: .3, restitution: .2 })
      movers.push({ body, angle: seconds => doorAngle(shape, seconds) })
    }
  }
  const marbles = Array.from({ length: course.starts.length / 2 }, (_, slot) => {
    const body = world.createDynamicBody({ position: { x: course.starts[slot * 2], y: course.starts[slot * 2 + 1] }, bullet: true, linearDamping: .1, angularDamping: .3 })
    body.createFixture(new Circle(course.marbleRadius), { density: 1, friction: .2, restitution: .35 })
    return body
  })

  const finishMs: (number | null)[] = marbles.map(() => null)
  const stillSince: (number | null)[] = marbles.map(() => null)
  const frames: number[] = []
  const record = () => marbles.forEach(body => frames.push(Math.round(body.getPosition().x * TRACK_SCALE), Math.round(body.getPosition().y * TRACK_SCALE)))
  record()
  const lastStep = Math.round(RACE_CAP_MS / 1000 / STEP_S)
  for (let step = 1; step <= lastStep; step++) {
    const before = (step - 1) * STEP_S
    // Kinematic parts follow the shared formulas exactly, with the speed that pushes the marbles.
    for (const mover of movers) mover.body.setAngularVelocity((mover.angle(before + STEP_S) - mover.angle(before)) / STEP_S)
    world.step(STEP_S, 8, 3)
    const ms = step * STEP_S * 1000
    marbles.forEach((body, slot) => {
      const position = body.getPosition()
      const velocity = body.getLinearVelocity()
      if (finishMs[slot] === null && position.y >= course.finishY) {
        // Back to the instant the line was crossed, so a step never decides a photo finish.
        finishMs[slot] = Math.round(Math.max(ms - STEP_S * 1000, ms - (position.y - course.finishY) / Math.max(velocity.y, .5) * 1000))
      }
      // shortcut: a marble squeezed through a wall is put back; a real escape would need thicker walls.
      if (position.x < RADIUS / 2 || position.x > WIDTH - RADIUS / 2 || position.y > course.height) {
        body.setTransform({ x: Math.min(WIDTH - RADIUS, Math.max(RADIUS, position.x)), y: Math.min(course.height - RADIUS, position.y) }, body.getAngle())
      }
      const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y)
      if (speed > MAX_SPEED) body.setLinearVelocity({ x: velocity.x * MAX_SPEED / speed, y: velocity.y * MAX_SPEED / speed })
      if (finishMs[slot] !== null || speed > STALL_SPEED) { stillSince[slot] = null; return }
      stillSince[slot] ??= ms
      if (ms - stillSince[slot]! < STALL_MS) return
      const mass = body.getMass()
      body.applyLinearImpulse({ x: sign(random) * 1.5 * mass, y: -2.5 * mass }, body.getWorldCenter(), true)
      stillSince[slot] = null
    })
    if (step % STEPS_PER_FRAME) continue
    record()
    if (finishMs.every(time => time !== null) && ms >= Math.max(...finishMs as number[]) + SETTLE_MS) break
  }

  const track = Int16Array.from(frames)
  const durationMs = Math.round((frames.length / (marbles.length * 2) - 1) * STEPS_PER_FRAME * STEP_S * 1000)
  const encoded = Buffer.from(track.buffer).toString('base64')
  // The final order uses the same rule and the same rounded frames as the phones.
  return { track: encoded, finishMs, durationMs, order: liveOrder(decodeTrack(encoded), finishMs, durationMs) }
}

const cache = new Map<string, { course: RaceCourse; run?: RaceRun }>()

function cached(seed: number, marbles: number) {
  const key = `${seed}:${marbles}`
  let entry = cache.get(key)
  if (!entry) {
    entry = { course: generateCourse(seed, marbles) }
    cache.set(key, entry)
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
  }
  return entry
}

/** The match state keeps only the seed: course and track are rebuilt here and stay out of the JSONB. */
export const courseFor = (seed: number, marbles: number) => cached(seed, marbles).course

export function raceFor(seed: number, marbles: number): RaceRun {
  const entry = cached(seed, marbles)
  entry.run ??= simulateRace(entry.course, seed)
  return entry.run
}
