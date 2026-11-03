'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GamePhase } from '../types'
import type { MinigameKind } from '../wheel'

export type SoundMode = 'full' | 'low' | 'tick' | 'silent'

const LOW_PHASES: GamePhase[] = ['category_vote', 'category_reveal', 'wheel_turn', 'minigame_playing']
const TICK_PHASES: GamePhase[] = ['question', 'flash_question', 'bonus_playing']
const SILENT_PHASES: GamePhase[] = ['countdown', 'suspended', 'aborted']
// Timed phases that lead into a ticking one: the music fades out before the clock starts.
const FADE_BEFORE_TICK: GamePhase[] = ['category_reveal', 'flash_intro']
const FADE_LEAD_MS = 1_500
const FADE_SECONDS = .7
const VOLUME: Record<SoundMode, number> = { full: .5, low: .15, tick: 0, silent: 0 }
const STORAGE_KEY = 'kb-audio'

export function soundModeFor(phase: GamePhase, minigameKind?: MinigameKind): SoundMode {
  // A tick every second would help count the hidden timer.
  if (SILENT_PHASES.includes(phase) || (phase === 'minigame_playing' && minigameKind === 'timer')) return 'silent'
  if (TICK_PHASES.includes(phase)) return 'tick'
  return LOW_PHASES.includes(phase) ? 'low' : 'full'
}

/** The clock speeds up near the deadline. */
export function tickIntervalMs(remainingMs: number) {
  return remainingMs <= 2_000 ? 250 : remainingMs <= 5_000 ? 500 : 1_000
}

function click(context: AudioContext) {
  const at = context.currentTime
  const tone = context.createOscillator()
  const envelope = context.createGain()
  tone.frequency.value = 1_600
  envelope.gain.setValueAtTime(.2, at)
  envelope.gain.exponentialRampToValueAtTime(.001, at + .04)
  tone.connect(envelope).connect(context.destination)
  tone.start(at)
  tone.stop(at + .05)
}

/** Device preference only: music and ticks never affect the game. */
export function useSoundtrack({ phase, minigameKind, deadline, clockOffsetMs }: { phase: GamePhase; minigameKind?: MinigameKind; deadline: number | null; clockOffsetMs: number }) {
  const mode = soundModeFor(phase, minigameKind)
  const [enabled, setEnabled] = useState(true)
  const [fadingOut, setFadingOut] = useState(false)
  const context = useRef<AudioContext | null>(null)
  // iOS ignores the volume of an <audio> element, so the music goes through a gain node.
  const musicGain = useRef<GainNode | null>(null)
  const target = useRef(0)
  target.current = enabled && !fadingOut ? VOLUME[mode] : 0

  const applyVolume = useCallback(() => {
    if (context.current && musicGain.current) musicGain.current.gain.setTargetAtTime(target.current, context.current.currentTime, FADE_SECONDS)
  }, [])

  useEffect(() => {
    try { setEnabled(window.localStorage.getItem(STORAGE_KEY) !== 'off') } catch {}
    const music = new Audio('/audio/elevator-synth.mp3')
    music.loop = true
    // Browsers only start audio after a gesture.
    const unlock = () => {
      if (!context.current) {
        const audio = new AudioContext()
        musicGain.current = audio.createGain()
        musicGain.current.gain.value = 0
        audio.createMediaElementSource(music).connect(musicGain.current).connect(audio.destination)
        context.current = audio
      }
      void context.current.resume()
      void music.play().then(() => {
        applyVolume()
        window.removeEventListener('pointerdown', unlock)
        window.removeEventListener('keydown', unlock)
      }).catch(() => {})
    }
    // A phone in a pocket stays quiet.
    const pauseWhenHidden = () => {
      if (document.visibilityState === 'hidden') void context.current?.suspend()
      else void context.current?.resume()
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      document.removeEventListener('visibilitychange', pauseWhenHidden)
      music.pause()
      void context.current?.close()
      context.current = null
      musicGain.current = null
    }
  }, [applyVolume])

  useEffect(() => {
    setFadingOut(false)
    if (!FADE_BEFORE_TICK.includes(phase) || deadline === null) return
    const timer = window.setTimeout(() => setFadingOut(true), deadline - FADE_LEAD_MS - (Date.now() + clockOffsetMs))
    return () => window.clearTimeout(timer)
  }, [phase, deadline, clockOffsetMs])

  useEffect(applyVolume, [applyVolume, mode, enabled, fadingOut])

  useEffect(() => {
    if (mode !== 'tick' || !enabled || deadline === null) return
    let timer = 0
    const step = () => {
      const remainingMs = deadline - (Date.now() + clockOffsetMs)
      if (remainingMs <= 0) return
      if (context.current?.state === 'running') click(context.current)
      timer = window.setTimeout(step, tickIntervalMs(remainingMs))
    }
    step()
    return () => window.clearTimeout(timer)
  }, [mode, enabled, deadline, clockOffsetMs])

  const toggle = useCallback(() => setEnabled(current => {
    try { window.localStorage.setItem(STORAGE_KEY, current ? 'off' : 'on') } catch {}
    return !current
  }), [])

  return { enabled, toggle }
}
