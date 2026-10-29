import { PlayerAvatar } from '../../rooms/components/player-avatar'
import type { GamePlayer } from '../types'
import styles from '../styles/game-stage.module.css'
import { TEXTS } from '../../../texts'

const pointsFormatter = new Intl.NumberFormat('it-IT')

export function GameLeaderboard({ players, selfId, showGains = false, showBreakdown = false }: {
  players: GamePlayer[]
  selfId: string
  showGains?: boolean
  showBreakdown?: boolean
}) {
  return (
    <ol className={styles.leaderboard} aria-label={TEXTS.leaderboard.label}>
      {[...players].sort((left, right) => left.rank - right.rank).map((player) => (
        <li key={player.id} className={`${styles.playerRow} ${player.id === selfId ? styles.selfRow : ''}`}>
          <span className={styles.rank} aria-label={TEXTS.leaderboard.position(player.rank)}>{player.rank}°</span>
          <PlayerAvatar avatarId={player.avatarId} className="size-10 sm:size-12" />
          <div className={styles.playerName}>
            <p>{player.nickname}{player.id === selfId && <span className={styles.youLabel}>{TEXTS.leaderboard.you}</span>}</p>
            {showBreakdown && <span className={styles.presence}>{TEXTS.leaderboard.breakdown(pointsFormatter.format(player.triviaPoints ?? player.points), pointsFormatter.format(player.bonusPoints ?? 0), pointsFormatter.format(player.points))}</span>}
            {(player.retired || !player.connected) && <span className={styles.presence}>{player.retired ? TEXTS.leaderboard.retired : TEXTS.leaderboard.reconnecting}</span>}
          </div>
          <div className={styles.playerPoints}>
            <span>{pointsFormatter.format(player.points)}<span className={styles.pointsUnit}>{TEXTS.leaderboard.pointsUnit}</span></span>
            {showGains && <span className={styles.gain}>{TEXTS.leaderboard.roundGain(pointsFormatter.format(player.roundPoints))}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}
