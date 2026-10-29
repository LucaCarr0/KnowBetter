'use client'

import { Select } from '@base-ui/react/select'
import { Check, CheckCircle2, ChevronDown, Sparkles, WandSparkles } from 'lucide-react'
import { useState } from 'react'
import { PlayerAvatar } from '../../rooms/components/player-avatar'
import { MAX_POWER_CARDS, POWERS } from '../powers'
import type { GameAction, GameCommandFields, GameSnapshot } from '../types'
import styles from '../styles/powers.module.css'
import { TEXTS } from '../../../texts'

export function PowerPreparation({ game, selfId, disabled, pending, onCommand }: {
  game: GameSnapshot
  selfId: string
  disabled: boolean
  pending: boolean
  onCommand: (action: GameAction, input: GameCommandFields) => Promise<void>
}) {
  const [cardId, setCardId] = useState('')
  const [targetId, setTargetId] = useState('')
  const targets = game.players.filter(player => player.id !== selfId && player.connected && !player.retired)
  const targetAvailable = targets.some(player => player.id === targetId && !game.powers.targetedIds.includes(player.id))
  const selectedTarget = targetAvailable ? targets.find(player => player.id === targetId) : undefined
  const locked = disabled || game.powers.ready || pending

  return (
    <section className={`daisy-card ${styles.preparation}`} aria-labelledby="power-preparation-title">
      <div className={styles.heading}><Sparkles size={21} aria-hidden="true" /><h2 id="power-preparation-title">{TEXTS.powers.heading}</h2><span className={`daisy-badge ${styles.counter}`}>{game.powers.inventory.length}/{MAX_POWER_CARDS}</span></div>
      {!game.powers.used && <p className={styles.copy}>{TEXTS.powers.intro}</p>}
      {game.powers.ready ? <p role="status" className={styles.ready}><CheckCircle2 size={20} aria-hidden="true" />{game.powers.used ? TEXTS.powers.launched : TEXTS.powers.kept}</p> : <>
        {game.powers.used ? <p className={styles.copy}>{TEXTS.powers.alreadyUsed}</p> : game.powers.inventory.length ? <>
          <div className={styles.cards} role="group" aria-label={TEXTS.powers.cardsLabel}>
            {game.powers.inventory.map(card => {
              const power = POWERS.find(item => item.kind === card.kind)!
              return <button type="button" key={card.id} disabled={locked} aria-pressed={cardId === card.id} className={`daisy-btn ${styles.card} ${cardId === card.id ? styles.selected : ''}`} onClick={() => setCardId(card.id)}><strong>{power.name}</strong><span>{power.description}</span></button>
            })}
          </div>
          <label id="power-target-label" htmlFor="power-target" className={styles.targetLabel}>{TEXTS.powers.targetLabel}</label>
          <Select.Root value={selectedTarget?.id ?? null} onValueChange={value => setTargetId(value ?? '')} disabled={locked} items={targets.map(player => ({ value: player.id, label: player.nickname }))}>
            <Select.Trigger id="power-target" aria-labelledby="power-target-label" className={`daisy-btn ${styles.target}`}>
              {selectedTarget && <PlayerAvatar avatarId={selectedTarget.avatarId} className="size-10" />}
              <Select.Value className="min-w-0 flex-1 break-words text-left">{selectedTarget ? `${selectedTarget.nickname} · ${selectedTarget.rank}°` : TEXTS.powers.targetPlaceholder}</Select.Value>
              <Select.Icon><ChevronDown size={18} aria-hidden="true" /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50">
                <Select.Popup className="daisy-card w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-2 border-base-content bg-base-100 p-1.5 text-base-content shadow-lg">
                  <Select.List className="daisy-list max-h-[min(18rem,var(--available-height))] overflow-y-auto">
                    {targets.map(player => <Select.Item key={player.id} value={player.id} label={player.nickname} disabled={game.powers.targetedIds.includes(player.id)} className="daisy-list-row cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-base-200 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50">
                      <PlayerAvatar avatarId={player.avatarId} className="size-10" />
                      <Select.ItemText className="min-w-0 break-words"><span className="font-bold">{player.nickname}</span><span className="block text-xs">{TEXTS.powers.targetRank(player.rank)}{game.powers.targetedIds.includes(player.id) ? TEXTS.powers.alreadyHit : ''}</span></Select.ItemText>
                      <Select.ItemIndicator><Check size={18} aria-hidden="true" /></Select.ItemIndicator>
                    </Select.Item>)}
                  </Select.List>
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
          {!targets.some(player => !game.powers.targetedIds.includes(player.id)) && <p className={styles.copy}>{TEXTS.powers.allHit}</p>}
          <button type="button" className={`daisy-btn ${styles.launch}`} disabled={locked || !cardId || !targetAvailable || !game.powers.preparationId} onClick={() => void onCommand('game:use-power', { powerCardId: cardId, targetId, questionInstanceId: game.powers.preparationId! })}><WandSparkles size={18} aria-hidden="true" />{pending ? TEXTS.game.sending : TEXTS.powers.launch}</button>
        </> : <p className={styles.copy}>{TEXTS.powers.empty}</p>}
        <button type="button" className={`daisy-btn ${styles.keep}`} disabled={locked || !game.powers.preparationId} onClick={() => void onCommand('game:ready-question', { questionInstanceId: game.powers.preparationId! })}>{game.powers.inventory.length && !game.powers.used ? TEXTS.powers.keepAndPass : TEXTS.powers.ready}</button>
      </>}
      <p className={styles.copy} role="status">{TEXTS.powers.readyCount(game.powers.readyCount, game.players.filter(player => !player.retired).length)}</p>
    </section>
  )
}
