import { PlayerAvatar } from '../../rooms/components/player-avatar'
import type { GamePlayer } from '../types'
import styles from '../styles/game-stage.module.css'

const pointsFormatter = new Intl.NumberFormat('it-IT')

export function GameLeaderboard({ players, selfId, showGains = false }: {
  players: GamePlayer[]
  selfId: string
  showGains?: boolean
}) {
  return (
    <ol className={styles.leaderboard} aria-label="Classifica dei punti">
      {[...players].sort((left, right) => left.rank - right.rank).map((player) => (
        <li key={player.id} className={`${styles.playerRow} ${player.id === selfId ? styles.selfRow : ''}`}>
          <span className={styles.rank} aria-label={`Posizione ${player.rank}`}>{player.rank}°</span>
          <PlayerAvatar avatarId={player.avatarId} className="size-10 sm:size-12" />
          <div className={styles.playerName}>
            <p>{player.nickname}{player.id === selfId && <span className={styles.youLabel}> tu</span>}</p>
            {(player.retired || !player.connected) && <span className={styles.presence}>{player.retired ? 'Ha lasciato la partita' : 'In riconnessione'}</span>}
          </div>
          <div className={styles.playerPoints}>
            <span>{pointsFormatter.format(player.points)}<span className={styles.pointsUnit}> pt</span></span>
            {showGains && <span className={styles.gain}>+{pointsFormatter.format(player.roundPoints)} nel round</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}
