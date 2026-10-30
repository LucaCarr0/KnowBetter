'use client'

import { motion, useReducedMotion } from 'framer-motion'

// Adapted from OriginKit Stagger Text Rise: https://www.originkit.dev/components/stagger-text-rise
// Kept: the spring and the per-letter stagger. Words stay unbroken so titles wrap cleanly.
export function StaggerRise({ text }: { text: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <>{text}</>
  let index = 0
  return (
    <span aria-label={text}>
      {text.split(' ').map((word, wordIndex) => (
        <span key={wordIndex} aria-hidden="true" style={{ display: 'inline-block', whiteSpace: 'pre' }}>
          {[...word, ...(wordIndex < text.split(' ').length - 1 ? [' '] : [])].map((letter, letterIndex) => (
            <motion.span key={letterIndex} style={{ display: 'inline-block', whiteSpace: 'pre' }}
              initial={{ y: 22, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18, delay: index++ * .018 }}>
              {letter}
            </motion.span>
          ))}
        </span>
      ))}
    </span>
  )
}
