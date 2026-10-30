import type { MinigameKind } from '../../../features/game/wheel'
import { balloonGame } from './balloon'
import { bombGame } from './bomb'
import { chestsGame } from './chests'
import { highestGame } from './highest'
import { numbersGame } from './numbers'
import { timerGame } from './timer'
import type { MinigameDefinition } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each run stores its own opaque state
export const MINIGAMES: Record<MinigameKind, MinigameDefinition<any>> = {
  timer: timerGame, numbers: numbersGame, balloon: balloonGame, chests: chestsGame, highest: highestGame, bomb: bombGame,
}

export const MINIGAME_KINDS = Object.keys(MINIGAMES) as MinigameKind[]
