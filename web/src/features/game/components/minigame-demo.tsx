'use client'

import type { MinigameKind } from '../wheel'
import styles from '../styles/wheel.module.css'

/** Self-playing previews: pure CSS loops, so a phone showing rules does no work. */
export function MinigameDemo({ kind }: { kind: MinigameKind }) {
  switch (kind) {
    case 'timer': return <div className={styles.demoStage}><span className={styles.demoDigits}>07.3</span><span className={styles.demoStop}>STOP</span></div>
    case 'numbers': return <div className={`${styles.demoStage} ${styles.demoGrid}`}>{[3, 1, 4, 2, 6, 5, 8, 7].map((value, index) => <span key={value} className={styles.demoTile} style={{ animationDelay: `${(value - 1) * .4}s` }} data-index={index}>{value}</span>)}</div>
    case 'balloon': return <div className={styles.demoStage}><span className={styles.demoBalloon}>🎈</span><span className={styles.demoPop}>💥</span></div>
    case 'chests': return <div className={styles.demoStage}>{['1.500', '800', '300'].map((value, index) => <span key={value} className={styles.demoChest} style={{ animationDelay: `${index * .5}s` }}>🧰<small>{value}</small></span>)}</div>
    case 'highest': return <div className={styles.demoStage}>{[20, 20, 17, 9].map((value, index) => <span key={index} className={`${styles.demoNumber} ${value === 17 ? styles.demoNumberWin : ''}`} style={{ animationDelay: `${index * .25}s` }}>{value}</span>)}</div>
    case 'bomb': return <div className={styles.demoStage}><span className={styles.demoPlayer}>🐼</span><span className={styles.demoPlayer}>🦊</span><span className={styles.demoPlayer}>🐸</span><span className={styles.demoBomb}>💣</span></div>
  }
}
