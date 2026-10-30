'use client'

import { useEffect, useRef } from 'react'

// Adapted from OriginKit Fireworks: https://www.originkit.dev/components/fireworks
// Same canvas spark model on a transparent layer: a few bursts that end on their own.
const COLORS = ['#ffd166', '#ff7657', '#b8e36d', '#4cc9f0', '#ff4d6d']
const GRAVITY = 260
const SPARKS_PER_BURST = 46

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }

export function FireworksBurst({ bursts = 4, className }: { bursts?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const context = canvas.getContext('2d')
    if (!context) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, canvas.clientWidth)
    const height = Math.max(1, canvas.clientHeight)
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    const sparks: Spark[] = []
    let launched = 0
    let frame = 0
    let last = 0
    let started = 0

    const launch = () => {
      const x = width * (.2 + Math.random() * .6)
      const y = height * (.15 + Math.random() * .4)
      const color = COLORS[Math.floor(Math.random() * COLORS.length)]
      for (let index = 0; index < SPARKS_PER_BURST; index++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 40 + Math.random() * 150
        const life = .6 + Math.random() * .6
        sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, max: life, color })
      }
    }

    const render = (now: number) => {
      started ||= now
      const delta = Math.min(.05, last ? (now - last) / 1000 : 0)
      last = now
      while (launched < bursts && now - started >= launched * 320) { launch(); launched++ }
      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = 'lighter'
      for (let index = sparks.length - 1; index >= 0; index--) {
        const spark = sparks[index]
        spark.life -= delta
        if (spark.life <= 0) { sparks.splice(index, 1); continue }
        spark.vy += GRAVITY * delta
        spark.x += spark.vx * delta
        spark.y += spark.vy * delta
        context.globalAlpha = spark.life / spark.max
        context.fillStyle = spark.color
        context.fillRect(spark.x, spark.y, 2.5, 2.5)
      }
      if (sparks.length || launched < bursts) frame = requestAnimationFrame(render)
      else context.clearRect(0, 0, width, height)
    }
    frame = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frame)
  }, [bursts])

  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
}
