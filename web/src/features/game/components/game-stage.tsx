'use client'

import { Check, CheckCircle2, Clock3, LogOut, Radio, Send, Sparkles, Trophy, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ScoreBurst } from '../../../components/originkit/score-burst'
import type { RoomResponse } from '../../rooms/types'
import { PlayerAvatar } from '../../rooms/components/player-avatar'
import { useGameClock } from '../hooks/use-game-clock'
import type { GameAction, GameCommandFields, GameSnapshot } from '../types'
import { GameLeaderboard } from './game-leaderboard'
import { JerryPresenter } from './jerry-presenter'
import { SwipeToContinue } from './swipe-to-continue'
import styles from '../styles/game-stage.module.css'

export interface GameStageProps {
  game: GameSnapshot
  selfId: string
  roomCode: string
  isHost: boolean
  connected: boolean
  controlConflict?: boolean
  serverClockOffsetMs?: number
  onCommand: (action: GameAction, input?: GameCommandFields) => Promise<RoomResponse>
  onLeave: () => Promise<RoomResponse>
  onTakeControl?: () => Promise<RoomResponse>
}

const numberFormatter = new Intl.NumberFormat('it-IT')

export function GameStage({ game, selfId, roomCode, isHost, connected, controlConflict = false, serverClockOffsetMs, onCommand, onLeave, onTakeControl }: GameStageProps) {
  const self = game.players.find((player) => player.id === selfId)
  const sceneKey = `${game.id}:${game.round}:${game.phase}:${game.question?.instanceId ?? ''}`
  const currentScene = useRef(sceneKey)
  currentScene.current = sceneKey
  const [selection, setSelection] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const scoreboard = useRef<HTMLDialogElement>(null)
  const leaveDialog = useRef<HTMLDialogElement>(null)
  const clock = useGameClock({ serverNow: game.serverNow, deadline: game.deadline, opensAt: game.opensAt, serverClockOffsetMs })
  const callback = useRef(onCommand)
  callback.current = onCommand

  useEffect(() => {
    setSelection(null)
    setError('')
    setPending(false)
    scoreboard.current?.close()
    heading.current?.focus({ preventScroll: true })
  }, [sceneKey])

  useEffect(() => {
    const synchronize = () => {
      if (document.visibilityState === 'visible') void callback.current('game:resume').catch(() => {})
    }
    document.addEventListener('visibilitychange', synchronize)
    return () => document.removeEventListener('visibilitychange', synchronize)
  }, [])

  async function send(action: GameAction, input?: GameCommandFields) {
    if (pending) return
    const submittedScene = sceneKey
    setPending(true)
    setError('')
    try {
      const result = await onCommand(action, { matchId: game.id, roundId: game.round, ...input })
      if (currentScene.current === submittedScene && !result.ok) setError(result.error.message)
    } catch {
      if (currentScene.current === submittedScene) setError('Conferma non ricevuta. Controlla la connessione e riprova: i punti non vengono duplicati.')
    } finally {
      if (currentScene.current === submittedScene) setPending(false)
    }
  }

  async function leave() {
    setPending(true)
    setError('')
    try {
      const result = await onLeave()
      if (!result.ok) { leaveDialog.current?.close(); setError(result.error.message) }
    } catch {
      leaveDialog.current?.close()
      setError('Uscita non confermata. Riprova quando la connessione è disponibile.')
    } finally { setPending(false) }
  }

  async function takeControl() {
    if (!onTakeControl || pending) return
    setPending(true)
    setError('')
    try {
      const result = await onTakeControl()
      if (!result.ok) setError(result.error.message)
    } catch {
      setError('Non è stato possibile riprendere il controllo. Controlla la connessione e riprova.')
    } finally { setPending(false) }
  }

  function submitSelection(event: FormEvent) {
    event.preventDefault()
    if (!selection) return
    if (game.phase === 'category_vote') void send('game:vote-category', { categoryId: selection })
    else if (game.phase === 'question' && game.question) void send('game:answer', { optionId: selection, questionInstanceId: game.question.instanceId })
  }

  const isVoting = game.phase === 'category_vote'
  const isQuestion = game.phase === 'question'
  const isReveal = game.phase === 'round_reveal'
  const manualPhase = game.phase === 'intro' || game.phase === 'round_ready' ? game.phase : null
  const enoughPlayers = game.players.filter((player) => player.connected && !player.retired).length >= 2
  const isInteractive = isVoting || isQuestion
  const confirmed = isVoting ? game.selfVote : game.selfAnswer
  const disabled = pending || !connected || controlConflict || !clock.isOpen || Boolean(confirmed) || !self || self.retired
  const sceneTitle = isVoting ? 'Il prossimo argomento?'
    : isQuestion ? 'È la tua risposta definitiva?'
      : game.phase === 'countdown' ? 'Ciak, si gioca!'
        : game.phase === 'intro' ? 'Benvenuti nello studio!'
          : game.phase === 'category_reveal' ? 'Il pubblico ha scelto!'
            : isReveal ? 'E la risposta giusta è…'
              : game.phase === 'scoreboard' ? 'Facciamo il punto.'
                : game.phase === 'round_ready' ? `Pronti per il round ${game.round + 1}?`
                  : game.phase === 'phase_complete' ? 'Prima fase, fatta!'
                  : game.phase === 'suspended' ? 'Una piccola pausa.' : 'Ci fermiamo qui.'

  function panelMessage(): ReactNode {
    switch (game.phase) {
      case 'countdown': return <p>Telefoni pronti, cervelli accesi. Stiamo per andare in onda!</p>
      case 'intro': return <><p>Io sono Jerry. Voi siete quelli che sanno tutto… giusto?</p><ol className={styles.rules}><li>Votate la categoria prima di ogni round.</li><li>Scegliete e confermate una delle quattro risposte.</li><li>Risposta giusta: 500 punti, più un bonus fino a 500 se siete rapidi!</li></ol><p className={styles.smallCopy}>Cinque round. Nessuna penalità per gli errori. Scaldate i pollici!</p></>
      case 'category_reveal': return <><p>Si gioca con <strong>{game.category?.name ?? 'la categoria scelta'}</strong>!</p><p className={styles.smallCopy}>{game.selectionReason === 'tie' ? 'Parità di voti: il sorteggio ha deciso.' : game.selectionReason === 'abstention' ? 'Nessun voto: ci ha pensato il sorteggio.' : 'La categoria che ha raccolto più voti.'} Tra un attimo arriva la domanda.</p></>
      case 'round_reveal': return <><p>{self?.roundPoints ? 'Lo sapevi! Mi sa che qui c’è della stoffa.' : 'Una domanda in più, una curiosità in più. E si riparte!'}</p><p className={styles.smallCopy}>La classifica si aggiorna con i punti di questo round.</p></>
      case 'scoreboard': return <><p>{game.round < game.totalRounds ? 'Occhio alla classifica: c’è ancora spazio per la rimonta!' : 'Cinque domande dopo, guardate quanti punti avete portato a casa.'}</p><p className={styles.smallCopy}>{game.round < game.totalRounds ? 'Poi sarete voi a scegliere quando iniziare il prossimo round.' : 'Tra poco il riepilogo della prima fase.'}</p></>
      case 'round_ready': return <><p>Riprendete fiato, confrontate i punti. Il prossimo round parte quando volete voi!</p><p className={styles.smallCopy}>Un giocatore trascina il pulsante e tutto il gruppo passa al voto della categoria.</p></>
      case 'phase_complete': return <><p>Bel lavoro, squadra! Ecco i punti accumulati nei {game.totalRounds} round.</p><p className={styles.smallCopy}>Questa è la classifica della Fase 1. La vittoria della partita si deciderà nelle fasi successive, che arriveranno con un prossimo aggiornamento.</p></>
      case 'suspended': return <><p>Ci servono almeno due concorrenti connessi per continuare.</p><p className={styles.smallCopy}>I punti sono conservati. Aspettiamo chi sta rientrando.</p></>
      case 'aborted': return <><p>Questa fase è stata interrotta. Nessuna vittoria assegnata.</p><p className={styles.smallCopy}>I risultati già confermati restano nel riepilogo.</p></>
      default: return null
    }
  }

  return (
    <main lang="it" className={styles.studio}>
      <div className={styles.studioInner}>
        <header className={styles.header}>
          <div className={styles.brandRow}><span className={styles.brand}>KNOW BETTER<span aria-hidden="true">.</span></span><span className={styles.roomCode}>STUDIO {roomCode}</span><button type="button" className={`daisy-btn daisy-btn-ghost ${styles.iconButton}`} onClick={() => leaveDialog.current?.showModal()} aria-label="Esci dalla partita"><LogOut size={18} aria-hidden="true" /></button></div>
          <div className={styles.playerBar}>
            <div className={styles.personalScore}>{self && <PlayerAvatar avatarId={self.avatarId} className="size-10" />}<div><span className={styles.selfName}>{self?.nickname ?? 'La tua partita'}</span><strong>{numberFormatter.format(self?.points ?? 0)} <small>punti</small></strong></div></div>
            <button type="button" className={`daisy-btn ${styles.scoreButton}`} onClick={() => scoreboard.current?.showModal()}><Trophy size={17} aria-hidden="true" /><span>Classifica</span>{self && <span className={styles.rankPill}>{self.rank}°</span>}</button>
          </div>
        </header>

        {controlConflict ? <div role="status" className={`daisy-alert ${styles.connectionAlert} ${styles.controlAlert}`}><Radio size={19} aria-hidden="true" /><div><p>Un’altra scheda controlla il tuo concorrente.</p><p className={styles.controlDetail}>{manualPhase ? 'Riprendi il controllo per proseguire da questa scheda.' : 'Il timer continua. Riprendi il controllo per giocare da questa scheda.'}</p></div>{onTakeControl && <button type="button" className={`daisy-btn ${styles.controlButton}`} disabled={pending} onClick={() => void takeControl()}>{pending ? 'Attendi…' : 'Continua qui'}</button>}</div>
          : !connected && <div role="status" className={`daisy-alert ${styles.connectionAlert}`}><Radio size={19} aria-hidden="true" /><span>{manualPhase ? 'Riconnessione in corso. Il gruppo sceglie quando proseguire.' : 'Riconnessione in corso. Il timer della stanza continua.'}</span></div>}
        {error && <div role="alert" className={`daisy-alert ${styles.errorAlert}`}>{error}</div>}

        <section key={sceneKey} className={`${styles.scene} ${isInteractive ? styles.interactiveScene : ''}`} aria-labelledby="game-scene-title">
          <div className={styles.sceneMeta}><span className={`daisy-badge ${styles.phaseBadge}`}>{game.phase === 'round_ready' ? `PROSSIMO ROUND ${game.round + 1} / ${game.totalRounds}` : game.round ? `ROUND ${game.round} / ${game.totalRounds}` : 'FASE 1 · TRIVIA'}</span><span className={styles.onAir}><Radio size={13} aria-hidden="true" /> {connected ? 'IN ONDA' : 'OFFLINE'}</span></div>
          <h1 id="game-scene-title" ref={heading} tabIndex={-1} aria-describedby={isQuestion && game.question ? 'current-question-prompt' : undefined} className={styles.title}>{sceneTitle}</h1>

          {game.deadline !== null && <div className={styles.timerBlock}><div className={styles.timerLabel}><span>{isVoting ? 'Tempo per votare' : isQuestion ? 'Tempo per rispondere' : game.phase === 'suspended' ? 'Attesa di riconnessione' : 'Tra poco…'}</span><span className={styles.timerNumber}><Clock3 size={15} aria-hidden="true" /><span role="timer" aria-label={`${clock.seconds} secondi rimanenti`} aria-live="off">{clock.seconds}<small>s</small></span></span></div><progress className={`daisy-progress ${styles.timerProgress}`} value={clock.remainingPercent} max={100} aria-label="Tempo residuo" /></div>}

          {isInteractive ? (
            <form onSubmit={submitSelection} className={styles.selectionForm}>
              <p className={styles.instructions}>{isVoting ? 'Scegli la tua categoria e conferma il voto. Vince la più votata!' : 'Scegli una risposta, poi confermala. Prima rispondi bene, più punti guadagni.'}</p>
              {isQuestion && game.question && <div className={styles.questionBox}><span className={styles.eyebrow}>{game.category?.name ?? 'Cultura generale'}{game.question.language !== 'it' && game.question.language !== 'it-IT' ? ` · ${game.question.language.toUpperCase()}` : ''}</span><h2 id="current-question-prompt" className={styles.questionText}>{game.question.prompt}</h2></div>}
              <div className={isVoting ? styles.categoryChoices : styles.answerChoices} role="group" aria-label={isVoting ? 'Categorie disponibili' : 'Risposte disponibili'}>
                {(isVoting ? game.candidates.map((category) => ({ id: category.id, text: category.name, icon: category.icon })) : game.question?.options ?? []).map((option, index) => {
                  const chosen = (confirmed ?? selection) === option.id
                  return <button type="button" key={option.id} disabled={disabled} aria-pressed={chosen} className={`daisy-btn ${styles.choice} ${chosen ? styles.selectedChoice : ''}`} onClick={() => { setSelection(option.id); setError('') }}><span className={styles.optionLetter}>{isVoting && 'icon' in option && option.icon ? option.icon as string : String.fromCharCode(65 + index)}</span><span className={styles.optionText}>{option.text}</span>{chosen && <Check size={21} className={styles.choiceCheck} aria-hidden="true" />}</button>
                })}
              </div>
              <div className={styles.confirmation} aria-live="polite">
                {confirmed ? <p className={styles.confirmedMessage}><CheckCircle2 size={21} aria-hidden="true" />{isVoting ? 'Voto confermato. Aspettiamo il gruppo!' : 'Risposta confermata. Tra poco la soluzione!'}</p>
                  : <button type="submit" disabled={disabled || !selection} className={`daisy-btn ${styles.confirmButton}`}>{pending ? <><span className="daisy-loading daisy-loading-spinner daisy-loading-sm" aria-hidden="true" /> Invio in corso…</> : <><Send size={18} aria-hidden="true" />{isVoting ? 'Conferma il voto' : 'Conferma la risposta'}</>}</button>}
                {!clock.isOpen && !confirmed && <p className={styles.smallCopy}>{clock.now < game.opensAt ? 'La finestra si aprirà tra un attimo.' : 'Tempo scaduto. Aspettiamo lo studio.'}</p>}
                <p className={styles.participantCount}>{isVoting ? game.votedCount : game.answeredCount} / {game.players.filter((player) => !player.retired).length} {isVoting ? 'voti ricevuti' : 'risposte ricevute'}</p>
              </div>
            </form>
          ) : (
            <>
              {game.phase === 'countdown' && <div className={styles.countdown} role="status" aria-label={clock.seconds ? `La partita inizia tra ${clock.seconds} secondi` : 'La partita sta per iniziare'}><span key={clock.seconds}>{clock.seconds || 'VIA!'}</span><p>Il tuo posto è in prima fila.</p></div>}
              <JerryPresenter compact={game.phase !== 'intro'}>{panelMessage()}</JerryPresenter>
              {manualPhase && <div className="my-6">
                <SwipeToContinue label={manualPhase === 'intro' ? 'Scorri per iniziare' : 'Scorri per il prossimo round'}
                  pending={pending} disabled={!connected || controlConflict || !self || self.retired || !enoughPlayers}
                  onContinue={() => send('game:continue', { expectedPhase: manualPhase })} />
                <p className={styles.smallCopy} role="status">{enoughPlayers ? 'Può farlo qualsiasi giocatore: uno swipe fa proseguire tutti.' : 'Aspettiamo almeno due concorrenti connessi. Poi potrete proseguire con uno swipe.'}</p>
              </div>}
              {game.phase === 'category_reveal' && game.category && <div className={styles.categoryReveal}><Sparkles aria-hidden="true" size={22} /><strong>{game.category.name}</strong>{game.categoryVotes && <span>{game.categoryVotes[game.category.id] ?? 0} voti</span>}</div>}
              {isReveal && game.question && game.reveal && <div className={styles.resultCard}><span className={styles.eyebrow}>Risposta corretta</span><p className={styles.correctAnswer}><CheckCircle2 size={23} aria-hidden="true" />{game.question.options.find((option) => option.id === game.reveal?.correctOptionId)?.text ?? 'Soluzione disponibile nello studio'}</p>{game.reveal.explanation && <p className={styles.explanation}>{game.reveal.explanation}</p>}<ScoreBurst active={Boolean(self?.roundPoints)} trigger={`${game.id}:${game.round}`}><p className={styles.roundGain}>+{numberFormatter.format(self?.roundPoints ?? 0)}<span> punti per te</span></p></ScoreBurst><p className={styles.answerFeedback}>{!game.selfAnswer ? 'Nessuna risposta confermata entro il termine.' : game.selfAnswer === game.reveal.correctOptionId ? 'Risposta giusta. Bel colpo!' : 'Questa volta non era quella giusta. Nessuna penalità.'}</p><p className={styles.source}>Fonte: <a href={game.reveal.sourceUrl} target="_blank" rel="noopener noreferrer">{game.reveal.sourceName}</a> · {game.reveal.license}</p></div>}
              {['intro', 'round_reveal', 'scoreboard', 'round_ready', 'phase_complete', 'suspended', 'aborted'].includes(game.phase) && <section className={styles.board} aria-labelledby="board-heading"><div className={styles.boardHeading}><Trophy size={20} aria-hidden="true" /><h2 id="board-heading">{game.phase === 'phase_complete' ? 'Classifica della Fase 1' : 'La classifica'}</h2></div><GameLeaderboard players={game.players} selfId={selfId} showGains={isReveal || game.phase === 'scoreboard' || game.phase === 'round_ready'} /></section>}
              {game.message && <p className={styles.serverMessage} role="status">{game.message}</p>}
              {(game.phase === 'phase_complete' || game.phase === 'aborted') && <div className={styles.endActions}>{isHost ? <button type="button" className={`daisy-btn ${styles.confirmButton}`} disabled={pending || !connected || controlConflict} onClick={() => void send('game:return-lobby')}>{pending ? 'Rientro in corso…' : 'Torna in stanza con il gruppo'}</button> : <p className={styles.smallCopy}>L’organizzatore può riportare il gruppo nella stanza.</p>}</div>}
            </>
          )}
        </section>
        <footer className={styles.footer}><span>FASE 1 · CULTURA GENERALE</span><span>Uno studio, tutta la crew.</span></footer>
      </div>

      <dialog ref={scoreboard} className={`daisy-modal ${styles.dialog}`} aria-labelledby="scoreboard-dialog-title"><div className={`daisy-modal-box ${styles.dialogBox}`}><div className={styles.dialogHeading}><h2 id="scoreboard-dialog-title">La classifica</h2><form method="dialog"><button className={`daisy-btn daisy-btn-ghost ${styles.dialogClose}`} aria-label="Chiudi classifica"><X size={20} aria-hidden="true" /></button></form></div><p className={styles.smallCopy}>{manualPhase ? 'Il gruppo sceglie quando proseguire con uno swipe.' : game.deadline !== null ? 'Il timer continua mentre consulti i punti.' : 'I punti confermati restano nella classifica della fase.'}</p><GameLeaderboard players={game.players} selfId={selfId} /><form method="dialog" className="mt-4"><button className={`daisy-btn ${styles.dialogReturn}`}>Torna al gioco</button></form></div><form method="dialog" className="daisy-modal-backdrop"><button aria-label="Chiudi classifica">Chiudi</button></form></dialog>
      <dialog ref={leaveDialog} className={`daisy-modal ${styles.dialog}`} aria-labelledby="leave-dialog-title"><div className={`daisy-modal-box ${styles.dialogBox}`}><h2 id="leave-dialog-title" className={styles.dialogTitle}>Lasciare lo studio?</h2><p className={styles.smallCopy}>Uscirai da questa partita. I tuoi punti già confermati restano in classifica, ma non potrai rientrare come concorrente.</p><div className={styles.leaveActions}><form method="dialog"><button className={`daisy-btn ${styles.dialogReturn}`} disabled={pending}>Resta in partita</button></form><button type="button" className={`daisy-btn ${styles.leaveButton}`} disabled={pending || !connected || controlConflict} onClick={() => void leave()}>{pending ? 'Uscita in corso…' : 'Esci dalla partita'}</button></div></div><form method="dialog" className="daisy-modal-backdrop"><button aria-label="Resta in partita" disabled={pending}>Chiudi</button></form></dialog>
    </main>
  )
}
