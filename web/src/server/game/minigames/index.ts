import type { MinigameKind } from '../../../features/game/wheel'
import { balloonGame } from './balloon'
import { betGame } from './bet'
import { bombGame } from './bomb'
import { chestsGame } from './chests'
import { duelGame } from './duel'
import { highestGame } from './highest'
import { numbersGame } from './numbers'
import { splitGame } from './split'
import { stealGame } from './steal'
import { timerGame } from './timer'
import { tugGame } from './tug'
import type { MinigameDefinition } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each run stores its own opaque state
export const MINIGAMES: Record<MinigameKind, MinigameDefinition<any>> = {
  timer: timerGame, numbers: numbersGame, balloon: balloonGame, chests: chestsGame, highest: highestGame, bomb: bombGame,
  steal: stealGame, duel: duelGame, tug: tugGame, split: splitGame, bet: betGame,
}

export const MINIGAME_KINDS = Object.keys(MINIGAMES) as MinigameKind[]
