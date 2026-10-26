'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// Adapted from OriginKit EmojiBurst: https://www.originkit.dev/components/emojiburst
// A single bounded burst on a confirmed result; no vibration or repeating effects.
export function ScoreBurst({ active, trigger, children }: {
  active: boolean
  trigger: string
  children: ReactNode
}) {
  const container = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const box = container.current
    const surface = layer.current
    if (!box || !surface) return
    const width = box.clientWidth
    const height = box.clientHeight
    let frame = 0
    let lastTimestamp = 0
    const particles = Array.from({ length: 10 }, (_, index) => {
      const el = document.createElement('span')
      el.textContent = index % 2 ? '✦' : '★'
      el.style.cssText = 'position:absolute;left:0;top:0;font-size:19px;line-height:1;pointer-events:none;user-select:none;will-change:transform,opacity'
      el.setAttribute('aria-hidden', 'true')
      surface.appendChild(el)
      const angle = (-90 + (Math.random() * 2 - 1) * 65) * Math.PI / 180
      const speed = 3 + Math.random() * 3
      return { el, x: width / 2, y: height * .85, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, rotation: Math.random() * 360, spin: (Math.random() * 2 - 1) * 8, life: 45 }
    })
    const step = (timestamp: number) => {
      const dt = lastTimestamp ? Math.min(3, (timestamp - lastTimestamp) / 16.6667) : 1
      lastTimestamp = timestamp
      let live = false
      for (const particle of particles) {
        particle.life -= dt
        if (particle.life <= 0) { particle.el.remove(); continue }
        live = true
        particle.vy += .19 * dt
        particle.x += particle.vx * dt
        particle.y += particle.vy * dt
        particle.rotation += particle.spin * dt
        particle.el.style.opacity = String(Math.min(1, particle.life / 15))
        particle.el.style.transform = `translate(${particle.x}px, ${particle.y}px) rotate(${particle.rotation}deg)`
      }
      if (live) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      for (const particle of particles) particle.el.remove()
    }
  }, [active, trigger])

  return (
    <div ref={container} className="relative overflow-hidden">
      {children}
      <div ref={layer} aria-hidden="true" className="pointer-events-none absolute inset-0 text-secondary" />
    </div>
  )
}
