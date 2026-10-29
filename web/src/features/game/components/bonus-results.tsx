import { PlayerAvatar } from '../../rooms/components/player-avatar'
import type { BonusResult, GamePlayer } from '../types'
import styles from '../styles/game-stage.module.css'
import { TEXTS } from '../../../texts'

const number = new Intl.NumberFormat('it-IT')

export function BonusResults({ results, players, selfId, target }: { results: BonusResult[]; players: GamePlayer[]; selfId: string; target: number }) {
  return <section className={styles.board} aria-labelledby="bonus-results-heading">
    <h2 id="bonus-results-heading" className={styles.boardHeading}>{TEXTS.bonus.resultsHeading}</h2>
    <ol className={styles.leaderboard} aria-label={TEXTS.bonus.resultsLabel}>
      {results.map(result => {
        const player = players.find(entry => entry.id === result.playerId)
        if (!player) return null
        return <li key={result.playerId} className={`${styles.playerRow} ${result.playerId === selfId ? styles.selfRow : ''}`}>
          <span className={styles.rank} aria-label={TEXTS.leaderboard.position(result.rank)}>{result.rank}°</span>
          <PlayerAvatar avatarId={player.avatarId} className="size-10 sm:size-12" />
          <div className={styles.playerName}><p>{player.nickname}{result.playerId === selfId && <span className={styles.youLabel}>{TEXTS.leaderboard.you}</span>}</p><span className={styles.presence}>{result.retired ? TEXTS.bonus.retired : TEXTS.bonus.finalChain(result.chain, target)}{result.completedMs !== null && !result.retired ? ` · ${(result.completedMs / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 })} s` : ''}</span></div>
          <div className={styles.playerPoints}>+{number.format(result.bonusPoints)}<span className={styles.pointsUnit}>{TEXTS.leaderboard.pointsUnit}</span></div>
        </li>
      })}
    </ol>
    <p className={styles.smallCopy}>{TEXTS.bonus.resultsRules}</p>
  </section>
}
