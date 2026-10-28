'use client'

import { Trophy, Vote } from 'lucide-react'
import { useId, useState, type CSSProperties } from 'react'
import { PlayerAvatar } from '../../rooms/components/player-avatar'
import type { GameSnapshot } from '../types'
import styles from '../styles/category-vote-result.module.css'

const ANIMATION_MS = 2_500
const FRAGMENTS = [
  { clip: 'polygon(0 0, 46% 0, 37% 47%, 0 36%)', x: '-42vw', y: '-13rem', turn: '-32deg' },
  { clip: 'polygon(46% 0, 100% 0, 100% 34%, 62% 54%, 37% 47%)', x: '40vw', y: '-11rem', turn: '38deg' },
  { clip: 'polygon(0 36%, 37% 47%, 53% 100%, 0 100%)', x: '-48vw', y: '12rem', turn: '-48deg' },
  { clip: 'polygon(37% 47%, 62% 54%, 100% 34%, 100% 100%, 53% 100%)', x: '49vw', y: '14rem', turn: '52deg' },
] as const

export function CategoryVoteResult({ game, selfId, elapsedMs }: {
  game: GameSnapshot
  selfId: string
  elapsedMs: number
}) {
  const titleId = useId()
  // Keep one animation timeline across clock ticks and power updates; reconnects enter at the current phase time.
  const [initialElapsed] = useState(() => Math.min(ANIMATION_MS, Math.max(0, elapsedMs)))
  const voters = game.categoryVoters
  const selectedVotes = game.categoryVotes?.[game.category?.id ?? ''] ?? 0
  const reason = game.selectionReason === 'tie'
    ? 'Parità in testa: il sorteggio ha scelto tra le categorie più votate.'
    : game.selectionReason === 'abstention'
      ? 'Nessun voto: categoria sorteggiata tra le tre proposte.'
      : game.selectionReason === 'votes'
        ? 'La maggioranza ha deciso: vince la categoria con più voti.'
        : 'Ecco la categoria scelta per questo round.'

  return (
    <section className={styles.result} aria-labelledby={titleId} style={{
      '--vote-duration': `${ANIMATION_MS}ms`,
      '--vote-offset': `${-initialElapsed}ms`,
    } as CSSProperties}>
      <h2 id={titleId} className={styles.heading}><Vote size={20} aria-hidden="true" />Un giocatore, un voto</h2>
      <p className={styles.rule}>Il voto è democratico: vince la categoria più votata. In parità, si sorteggia tra le prime.</p>
      <div className={styles.stage} aria-hidden="true">
        {game.candidates.map(category => {
          const selected = category.id === game.category?.id
          const count = game.categoryVotes?.[category.id] ?? 0
          const categoryVoters = (voters?.[category.id] ?? []).map(id => game.players.find(player => player.id === id)).filter(player => player !== undefined)

          return <div key={category.id} className={`${styles.slot} ${selected ? styles.winner : styles.loser}`} data-selected={selected}>
            <div className={styles.collapse}>
              <div className={styles.crop}>
                <div className={`daisy-card ${styles.card}`}>
                  <div className={styles.cardHeading}>
                    <h3>{category.name}</h3>
                    <span className={`daisy-badge ${styles.count}`}>{count} {count === 1 ? 'voto' : 'voti'}</span>
                  </div>
                  <div className={styles.voters}>
                    {categoryVoters.map(player => <span key={player.id} className={`${styles.voter} ${player.id === selfId ? styles.self : ''}`} title={`${player.nickname}${player.id === selfId ? ' (Tu)' : ''}`}>
                      <PlayerAvatar avatarId={player.avatarId} className={styles.avatar} />
                      {player.id === selfId && <span className={styles.you}>Tu</span>}
                    </span>)}
                    {!count && <span className={styles.empty}>Nessun voto</span>}
                    {count > 0 && !categoryVoters.length && <span className={styles.empty}>Voti confermati</span>}
                    {selected && <span className={styles.winnerLabel}><Trophy size={13} />{game.selectionReason === 'votes' ? 'La più votata' : 'Sorteggiata'}</span>}
                  </div>
                </div>
              </div>
            </div>
            {!selected && <div className={styles.fragments}>
              {FRAGMENTS.map((fragment, index) => <span key={index} className={styles.fragment} style={{
                clipPath: fragment.clip,
                '--fragment-x': fragment.x,
                '--fragment-y': fragment.y,
                '--fragment-turn': fragment.turn,
              } as CSSProperties}><span>{category.name}</span></span>)}
            </div>}
          </div>
        })}
      </div>
      <p className={styles.outcome} role="status"><strong>{game.category?.name ?? 'Categoria scelta'} · {selectedVotes} {selectedVotes === 1 ? 'voto' : 'voti'}</strong><span>{reason}</span></p>
      <details className={styles.summary}>
        <summary>Riepilogo di tutti i voti</summary>
        <ul>
          {game.candidates.map(category => {
            const count = game.categoryVotes?.[category.id] ?? 0
            const names = (voters?.[category.id] ?? []).map(id => game.players.find(player => player.id === id)).filter(player => player !== undefined).map(player => `${player.nickname}${player.id === selfId ? ' (Tu)' : ''}`)
            return <li key={category.id}><strong>{category.name}: {count} {count === 1 ? 'voto' : 'voti'}.</strong> {names.join(', ') || (count ? 'Voti confermati.' : 'Nessun voto.')}{category.id === game.category?.id && ' Categoria scelta.'}</li>
          })}
        </ul>
      </details>
    </section>
  )
}
