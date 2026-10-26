'use client'

import Image from 'next/image'
import { Mic2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import styles from '../styles/game-stage.module.css'

export function JerryPresenter({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <div className={`${styles.presenter} ${compact ? styles.presenterCompact : ''}`}>
      <figure className={styles.hostFrame}>
        {imageFailed
          ? <div className={styles.hostFallback}><Mic2 size={48} aria-hidden="true" /><span>Jerry</span></div>
          : <Image src="/hosts/jerry/jerry.webp" alt="Jerry, il conduttore di Know Better" width={1215} height={1295} priority unoptimized draggable={false} onError={() => setImageFailed(true)} className={styles.hostImage} />}
        <figcaption className={styles.hostName}><Mic2 size={14} aria-hidden="true" /> JERRY</figcaption>
      </figure>
      <div className={styles.balloon}><span className={styles.eyebrow}>La parola a Jerry</span>{children}</div>
    </div>
  )
}
