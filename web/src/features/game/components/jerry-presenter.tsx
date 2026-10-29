'use client'

import Image from 'next/image'
import { Mic2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import styles from '../styles/game-stage.module.css'
import { TEXTS } from '../../../texts'

export function JerryPresenter({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <div className={`${styles.presenter} ${compact ? styles.presenterCompact : ''}`}>
      <figure className={styles.hostFrame}>
        {imageFailed
          ? <div className={styles.hostFallback}><Mic2 size={48} aria-hidden="true" /><span>{TEXTS.jerry.name}</span></div>
          : <Image src="/hosts/jerry/jerry.webp" alt={TEXTS.jerry.imageAlt} width={1215} height={1295} priority unoptimized draggable={false} onError={() => setImageFailed(true)} className={styles.hostImage} />}
        <figcaption className={styles.hostName}><Mic2 size={14} aria-hidden="true" /> {TEXTS.jerry.caption}</figcaption>
      </figure>
      <div className={styles.balloon}><span className={styles.eyebrow}>{TEXTS.jerry.balloon}</span>{children}</div>
    </div>
  )
}
