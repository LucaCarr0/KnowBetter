import { PlayerAvatar } from '../../rooms/components/player-avatar'
import type { BonusResult, GamePlayer } from '../types'
import styles from '../styles/game-stage.module.css'

const number = new Intl.NumberFormat('it-IT')

export function BonusResults({ results, players, selfId, target }: { results: BonusResult[]; players: GamePlayer[]; selfId: string; target: number }) {
  return <section className={styles.board} aria-labelledby="bonus-results-heading">
    <h2 id="bonus-results-heading" className={styles.boardHeading}>Classifica di 21 al contrario</h2>
    <ol className={styles.leaderboard} aria-label="Classifica bonus">
      {results.map(result => {
        const player = players.find(entry => entry.id === result.playerId)
        if (!player) return null
        return <li key={result.playerId} className={`${styles.playerRow} ${result.playerId === selfId ? styles.selfRow : ''}`}>
          <span className={styles.rank} aria-label={`Posizione ${result.rank}`}>{result.rank}°</span>
          <PlayerAvatar avatarId={player.avatarId} className="size-10 sm:size-12" />
          <div className={styles.playerName}><p>{player.nickname}{result.playerId === selfId && <span className={styles.youLabel}> tu</span>}</p><span className={styles.presence}>{result.retired ? 'Ritirato · zero bonus' : `Catena finale ${result.chain}/${target}`}{result.completedMs !== null && !result.retired ? ` · ${(result.completedMs / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 })} s` : ''}</span></div>
          <div className={styles.playerPoints}>+{number.format(result.bonusPoints)}<span className={styles.pointsUnit}> pt</span></div>
        </li>
      })}
    </ol>
    <p className={styles.smallCopy}>Conta solo la catena finale. A 21 prevale il tempo minore; sotto 21 le catene uguali sono pari merito. Catena zero o ritiro: zero bonus.</p>
  </section>
}
