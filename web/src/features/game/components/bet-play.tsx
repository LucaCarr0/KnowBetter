'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Eye } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FireworksBurst } from '../../../components/originkit/fireworks-burst'
import { RollingCounter } from '../../../components/originkit/rolling-counter'
import { getAvatar } from '../../rooms/data/avatars'
import { DOOR_THICKNESS, HOUSE_STAKE, MIN_BET, ROTOR_THICKNESS, betPayout, decodeTrack, doorAngle, liveOrder, marbleAt, maxStake, rotorAngle, type MarbleRaceReveal, type RaceCourse, type RaceShape } from '../marble-race'
import type { MinigameView } from '../wheel'
import type { MinigamePlayProps } from './minigame-play'
import { CountUp } from './count-up'
import { TEXTS } from '../../../texts'
import styles from '../styles/wheel.module.css'

const B = TEXTS.wheel.minigames.bet
const numberFormatter = new Intl.NumberFormat('it-IT')
const format = (value: number) => numberFormatter.format(value)
const MARBLE_COLORS = ['#ff7657', '#4cc9f0', '#b8e36d', '#ffd166', '#c77dff', '#ff4d6d', '#2ec4b6', '#f4a261', '#8ecae6', '#e9c46a']
/** The betting preview sweeps the whole course and back: about one way while bets are open. */
const PAN_MS = 40_000
const BADGE_MS = 1_600
const STEP = 50

type BetView = Extract<MinigameView, { kind: 'bet' }>
type BetProps = MinigamePlayProps & { view: BetView }
interface RaceLayer { slots: string[]; track: Int16Array; finishMs: (number | null)[]; startAt: number }

const marbleStyle = (color: string) => ({ '--marble': color }) as CSSProperties
const roundStake = (value: number) => Math.max(MIN_BET, Math.round(value / STEP) * STEP)

export function BetPlay(props: BetProps) {
  const { view, players } = props
  const colors = useMemo(() => Object.fromEntries(view.marbleIds.map((id, index) => [id, MARBLE_COLORS[index % MARBLE_COLORS.length]])), [view.marbleIds])
  const avatars = useMemo(() => Object.fromEntries(view.marbleIds.map(id => [id, getAvatar(players.find(player => player.id === id)?.avatarId ?? 'panda').src])), [view.marbleIds, players])
  return view.race ? <RaceView {...props} race={view.race} colors={colors} avatars={avatars} /> : <Betting {...props} colors={colors} avatars={avatars} />
}

function MarbleFace({ src, color, className }: { src: string; color: string; className: string }) {
  return <span className={className} style={marbleStyle(color)}><Image src={src} alt="" width={64} height={64} unoptimized draggable={false} /></span>
}

function Betting({ view, players, selfId, participantCount, disabled, pending, now, startedAt, clockOffsetMs, onAction, colors, avatars }: BetProps & { colors: Record<string, string>; avatars: Record<string, string> }) {
  const reduced = useReducedMotion() ?? false
  const points = players.find(player => player.id === selfId)?.points ?? 0
  const max = maxStake(points)
  const [picked, setPicked] = useState<string | null>(null)
  const [amount, setAmount] = useState(() => Math.min(max, roundStake(max / 4)))
  const placed = view.selfBet
  const chosen = placed?.marbleId ?? picked
  const stake = placed?.amount ?? amount
  const locked = disabled || placed !== null || view.selfPassed
  const left = Math.max(0, Math.ceil((startedAt + view.betsCloseOffsetMs - now) / 1000))
  const nickname = (id: string) => players.find(player => player.id === id)?.nickname ?? ''

  return (
    <div className={styles.betScene}>
      <div className={styles.betPreview}>
        <MarbleRaceCanvas course={view.course} race={null} colors={colors} avatars={avatars} highlightId={null} followId={null} clockOffsetMs={clockOffsetMs} still={reduced} minView={8} />
        <span className={styles.betTimer} role="timer" aria-label={B.closesIn(left)}>{left}s</span>
      </div>
      <p className={styles.playHeadline}>{B.pick}</p>
      <div role="radiogroup" aria-label={B.pick} className={styles.marblePicker}>
        {view.marbleIds.map(id => (
          <button key={id} type="button" role="radio" aria-checked={chosen === id} aria-label={B.marble(nickname(id))} disabled={locked}
            className={`${styles.marbleChoice} ${chosen === id ? styles.marbleChoiceOn : ''}`} onClick={() => setPicked(id)}>
            <MarbleFace src={avatars[id]} color={colors[id]} className={styles.marbleGlass} />
            <span className={styles.marbleName}>{nickname(id)}</span>
          </button>
        ))}
      </div>
      <div className={styles.stakeBox}>
        <RollingCounter value={stake} min={MIN_BET} max={max} step={STEP} onChange={setAmount} disabled={locked} label={B.stake} lessLabel={B.less} moreLabel={B.more} />
        <input type="range" className="daisy-range daisy-range-sm" min={MIN_BET} max={max} step={STEP} value={stake} disabled={locked} aria-label={B.stake} onChange={event => setAmount(Number(event.target.value))} />
        <div className="daisy-join">
          <button type="button" className="daisy-btn daisy-btn-sm daisy-join-item" disabled={locked} onClick={() => setAmount(Math.min(max, roundStake(max / 2)))}>{B.half}</button>
          <button type="button" className="daisy-btn daisy-btn-sm daisy-join-item" disabled={locked} onClick={() => setAmount(max)}>{B.all}</button>
        </div>
        <p className={styles.stakeNote}>
          <span>{points < HOUSE_STAKE ? B.houseStake(format(max)) : B.yourPoints(format(points))}</span>
          <span className={`daisy-badge daisy-badge-sm ${styles.stakeOutcome}`}>{B.outcome(format(stake))}</span>
        </p>
      </div>
      {placed ? <p role="status" className={styles.playHeadline}>{B.placed(format(placed.amount), nickname(placed.marbleId))}</p>
        : view.selfPassed ? <p role="status" className={styles.playHeadline}>{B.passed}</p>
          : <div className={styles.betActions}>
            <button type="button" className={`daisy-btn ${styles.bigAction}`} disabled={disabled || pending || !chosen}
              onClick={() => { if (chosen) void onAction({ type: 'bet', marbleId: chosen, amount: stake }) }}>{B.confirm}</button>
            <button type="button" className="daisy-btn daisy-btn-ghost" disabled={disabled || pending} onClick={() => void onAction({ type: 'pass' })}>{B.pass}</button>
          </div>}
      <p role="status" className={styles.playStatus}>{B.waiting(view.betCount, participantCount)}</p>
    </div>
  )
}

/** Counts from the previous amount to the new one, only when it changes. */
function LiveAmount({ value }: { value: number }) {
  const [range, setRange] = useState({ from: value, to: value })
  if (range.to !== value) setRange({ from: range.to, to: value })
  return <CountUp from={range.from} to={range.to} durationMs={450} signed />
}

function RaceView({ view, race, players, selfId, now, startedAt, clockOffsetMs, colors, avatars }: BetProps & { race: MarbleRaceReveal; colors: Record<string, string>; avatars: Record<string, string> }) {
  const reduced = useReducedMotion() ?? false
  const [followId, setFollowId] = useState<string | null>(null)
  const startAt = startedAt + race.startOffsetMs
  const layer = useMemo<RaceLayer>(() => ({ slots: race.slots, track: decodeTrack(race.track), finishMs: race.finishMs, startAt }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slots and arrivals come with the track
    [race.track, startAt])
  const raceMs = now - startAt
  const ended = raceMs >= race.durationMs
  const order = ended ? race.order : liveOrder(layer.track, layer.finishMs, Math.max(0, raceMs)).map(slot => layer.slots[slot])
  const bet = race.bets[selfId] ?? null
  const position = bet ? order.indexOf(bet.marbleId) + 1 : 0
  const payout = bet ? betPayout(bet.amount, position, order.length) : 0
  const countdown = Math.ceil(-raceMs / 1000)
  const bettors = Object.values(race.bets).reduce<Record<string, number>>((counts, entry) => ({ ...counts, [entry.marbleId]: (counts[entry.marbleId] ?? 0) + 1 }), {})
  const nickname = (id: string) => players.find(player => player.id === id)?.nickname ?? ''

  return (
    <div className={styles.raceScene}>
      <ol className={styles.rankStrip}>
        {order.map((id, index) => (
          <motion.li key={id} layout={!reduced} transition={{ type: 'spring', stiffness: 500, damping: 34 }}>
            <button type="button" aria-pressed={followId === id} aria-label={B.follow(nickname(id), index + 1)} onClick={() => setFollowId(followId === id ? null : id)}
              className={`${styles.rankButton} ${followId === id ? styles.rankFollowed : ''} ${bet?.marbleId === id ? styles.rankMine : ''}`}>
              <span className="daisy-indicator">
                {bettors[id] ? <span className={`daisy-indicator-item daisy-badge daisy-badge-xs ${styles.rankBets}`} title={B.bettors(bettors[id])}>{bettors[id]}</span> : null}
                <MarbleFace src={avatars[id]} color={colors[id]} className={styles.stripMarble} />
              </span>
              <span>{followId === id ? <Eye size={11} aria-hidden="true" /> : null}{index + 1}ª</span>
            </button>
          </motion.li>
        ))}
      </ol>
      <div className={styles.raceFrame}>
        {reduced ? <p className={styles.raceStill}>{ended ? B.finalOrder : B.running}</p>
          : <MarbleRaceCanvas course={view.course} race={layer} colors={colors} avatars={avatars} highlightId={bet?.marbleId ?? null} followId={followId} clockOffsetMs={clockOffsetMs} still={false} minView={14} />}
        <AnimatePresence>
          {raceMs < 700 && countdown <= 3 && <motion.span key={countdown} className={styles.raceCountdown} aria-live="assertive"
            initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .6, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}>
            {B.countdown(Math.max(0, countdown))}
          </motion.span>}
        </AnimatePresence>
        {ended && <motion.ol className={styles.racePodium} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} aria-label={B.finalOrder}>
          {race.order.slice(0, 3).map((id, index) => (
            <li key={id} className={styles.podiumStep} data-place={index + 1}>
              <MarbleFace src={avatars[id]} color={colors[id]} className={styles.stripMarble} />
              <span>{index + 1}ª {nickname(id)}</span>
            </li>
          ))}
        </motion.ol>}
        {ended && position === 1 && <FireworksBurst bursts={3} className={styles.raceFireworks} />}
      </div>
      {bet ? <div className={styles.betBanner} role="status">
        <span>{ended ? B.yourResult : B.ifNow}</span>
        <strong className={payout < 0 ? styles.betLoss : ''}><LiveAmount value={raceMs > 0 ? payout : 0} /></strong>
        <small>{B.placed(format(bet.amount), nickname(bet.marbleId))}</small>
      </div> : <p className={styles.playStatus}>{B.noBet}</p>}
    </div>
  )
}

const circle = (context: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string | CanvasGradient, stroke?: string, width = .05) => {
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fillStyle = fill
  context.fill()
  if (!stroke) return
  context.lineWidth = width
  context.strokeStyle = stroke
  context.stroke()
}

const bar = (context: CanvasRenderingContext2D, from: number, to: number, thickness: number, fill: string) => {
  context.beginPath()
  context.roundRect(from, -thickness / 2, to - from, thickness, thickness / 2)
  context.fillStyle = fill
  context.fill()
  context.lineWidth = .045
  context.strokeStyle = '#10142f'
  context.stroke()
}

function drawShape(context: CanvasRenderingContext2D, shape: RaceShape, seconds: number, hit: (x: number, y: number, reach: number) => boolean, radius: number) {
  switch (shape.kind) {
    case 'wall':
      context.beginPath()
      context.moveTo(shape.points[0], shape.points[1])
      for (let index = 2; index < shape.points.length; index += 2) context.lineTo(shape.points[index], shape.points[index + 1])
      context.lineWidth = .16
      context.strokeStyle = '#f8f1e6'
      context.stroke()
      return
    case 'peg': circle(context, shape.x, shape.y, shape.r, '#f8f1e6'); return
    case 'bumper': {
      const lit = hit(shape.x, shape.y, shape.r + radius + .08)
      circle(context, shape.x, shape.y, shape.r + (lit ? .07 : 0), lit ? '#ffd166' : '#ff7657', '#10142f', .07)
      circle(context, shape.x, shape.y, shape.r * .5, lit ? '#fff8ec' : '#ffb199')
      return
    }
    case 'rotor': {
      const angle = rotorAngle(shape, seconds)
      context.save()
      context.translate(shape.x, shape.y)
      for (let arm = 0; arm < shape.arms; arm++) {
        context.save()
        context.rotate(angle + arm * Math.PI / shape.arms)
        bar(context, -shape.length, shape.length, ROTOR_THICKNESS, '#ffd166')
        context.restore()
      }
      circle(context, 0, 0, .17, '#10142f', '#ffd166', .06)
      context.restore()
      return
    }
    case 'door':
      context.save()
      context.translate(shape.x, shape.y)
      context.rotate(doorAngle(shape, seconds))
      bar(context, shape.side > 0 ? 0 : -shape.length, shape.side > 0 ? shape.length : 0, DOOR_THICKNESS, '#b8e36d')
      context.restore()
      circle(context, shape.x, shape.y, .14, '#10142f', '#b8e36d')
  }
}

function drawMarble(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, face: HTMLImageElement | undefined, mine: boolean, roll: number) {
  if (mine) {
    context.save()
    context.shadowColor = '#ff7657'
    context.shadowBlur = 18
    circle(context, x, y, radius + .1, '#ff7657')
    context.restore()
  }
  const glass = context.createRadialGradient(x - radius * .35, y - radius * .4, radius * .05, x, y, radius)
  glass.addColorStop(0, '#ffffff')
  glass.addColorStop(.32, color)
  glass.addColorStop(1, '#10142f')
  circle(context, x, y, radius, glass)
  if (face?.complete && face.naturalWidth) {
    context.save()
    context.beginPath()
    context.arc(x, y, radius * .74, 0, Math.PI * 2)
    context.clip()
    context.translate(x, y)
    // The animal rolls with the marble.
    context.rotate(roll)
    context.drawImage(face, -radius * .74, -radius * .74, radius * 1.48, radius * 1.48)
    context.restore()
  }
  context.beginPath()
  context.ellipse(x - radius * .32, y - radius * .42, radius * .3, radius * .15, -.5, 0, Math.PI * 2)
  context.fillStyle = 'rgba(255, 255, 255, .55)'
  context.fill()
  circle(context, x, y, radius, 'rgba(0, 0, 0, 0)', mine ? '#ff7657' : '#10142f', mine ? .08 : .05)
}

/** Draws the shared course on the shared clock: every phone shows the same moment of the same race. */
function MarbleRaceCanvas({ course, race, colors, avatars, highlightId, followId, clockOffsetMs, still, minView }: {
  course: RaceCourse
  /** Null while betting: the course alone, swept by the camera. */
  race: RaceLayer | null
  colors: Record<string, string>
  avatars: Record<string, string>
  highlightId: string | null
  followId: string | null
  clockOffsetMs: number
  still: boolean
  /** Metres always in view: on a wide screen the course is centred instead of zoomed in. */
  minView: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The camera survives new snapshots, so it never jumps.
  const camera = useRef(-1)
  const faces = useRef(new Map<string, HTMLImageElement>())
  const live = useRef({ course, colors, highlightId, followId })
  live.current = { course, colors, highlightId, followId }

  useEffect(() => {
    for (const [id, src] of Object.entries(avatars)) {
      if (faces.current.get(id)?.getAttribute('src') === src) continue
      const face = new window.Image()
      face.src = src
      faces.current.set(id, face)
    }
  }, [avatars])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const arrivals = race ? race.finishMs.map((time, slot) => ({ time, slot })).filter(entry => entry.time !== null).sort((left, right) => left.time! - right.time!).map(entry => entry.slot) : []
    let frame = 0
    let last = performance.now()

    const draw = () => {
      const { course: shapes, colors: palette, highlightId: mine, followId: followed } = live.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
      }
      const scale = Math.min(width / shapes.width, height / minView)
      const offset = (width - shapes.width * scale) / 2
      const viewHeight = height / scale
      const serverNow = Date.now() + clockOffsetMs
      const raceMs = race ? serverNow - race.startAt : 0
      const radius = shapes.marbleRadius
      const count = race?.slots.length ?? 0
      const positions = race ? race.slots.map((_, slot) => marbleAt(race.track, count, slot, raceMs)) : []
      const arrived = (slot: number) => race!.finishMs[slot] !== null && race!.finishMs[slot]! <= raceMs

      let target = 0
      let leader: number | undefined
      if (!race) target = still ? 0 : (shapes.height - viewHeight) * (.5 - .5 * Math.cos(serverNow / PAN_MS * 2 * Math.PI))
      else if (raceMs > 0) {
        const order = liveOrder(race.track, race.finishMs, raceMs)
        leader = order.find(slot => !arrived(slot))
        const chosen = followed ? race.slots.indexOf(followed) : -1
        target = positions[chosen >= 0 ? chosen : leader ?? order[order.length - 1]][1] - viewHeight * .4
      }
      target = Math.min(Math.max(0, shapes.height - viewHeight), Math.max(0, target))
      const tick = performance.now()
      camera.current = camera.current < 0 || !race ? target : camera.current + (target - camera.current) * Math.min(1, (tick - last) / 1000 * 4)
      last = tick
      const top = camera.current

      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const backdrop = context.createLinearGradient(0, 0, 0, height)
      backdrop.addColorStop(0, '#2b2f63')
      backdrop.addColorStop(1, '#10142f')
      context.fillStyle = backdrop
      context.fillRect(0, 0, width, height)

      context.setTransform(dpr * scale, 0, 0, dpr * scale, offset * dpr, -top * scale * dpr)
      context.lineCap = 'round'
      context.lineJoin = 'round'
      for (let column = 0; column * .3 < shapes.width; column++) {
        for (let row = 0; row < 2; row++) {
          context.fillStyle = (column + row) % 2 ? '#10142f' : '#f8f1e6'
          context.fillRect(column * .3, shapes.finishY - .3 + row * .3, .3, .3)
        }
      }
      const seconds = race ? raceMs / 1000 : serverNow / 1000
      const hit = (x: number, y: number, reach: number) => positions.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < reach * reach)
      for (const shape of shapes.shapes) drawShape(context, shape, seconds, hit, radius)

      if (race) {
        if (leader !== undefined) {
          for (let step = 6; step >= 1; step--) {
            const [x, y] = marbleAt(race.track, count, leader, raceMs - step * 45)
            context.globalAlpha = .45 - step * .06
            circle(context, x, y, radius * (1 - step * .07), palette[race.slots[leader]])
          }
          context.globalAlpha = 1
        }
        race.slots.forEach((id, slot) => {
          const [x, y] = positions[slot]
          drawMarble(context, x, y, radius, palette[id], faces.current.get(id), id === mine, (x - shapes.starts[slot * 2]) / radius)
        })
        context.setTransform(dpr, 0, 0, dpr, 0, 0)
        context.font = '900 13px system-ui, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        arrivals.forEach((slot, index) => {
          const since = raceMs - race.finishMs[slot]!
          if (since < 0 || since > BADGE_MS) return
          const [x, y] = positions[slot]
          const left = offset + x * scale
          const middle = (y - top - radius) * scale - 13
          context.globalAlpha = Math.min(1, (BADGE_MS - since) / 300)
          context.beginPath()
          context.roundRect(left - 19, middle - 10, 38, 20, 10)
          context.fillStyle = index === 0 ? '#ffd166' : '#fff8ec'
          context.fill()
          context.lineWidth = 2
          context.strokeStyle = '#10142f'
          context.stroke()
          context.fillStyle = '#10142f'
          context.fillText(B.arrived(index + 1), left, middle + 1)
          context.globalAlpha = 1
        })
      }
      if (!still) frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [race, clockOffsetMs, still, minView])

  return <canvas ref={canvasRef} className={styles.raceCanvas} aria-hidden="true" />
}
