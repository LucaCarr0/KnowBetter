export type PowerKind = 'scramble' | 'fog' | 'shuffle' | 'spotlight'
export interface PowerCard { id: string; kind: PowerKind }
export interface PowerEffect {
  kind: PowerKind
  fromId: string
  revealedOptionIds: string[]
}

export const POWERS = [
  { kind: 'scramble', name: 'Lettere ribelli', description: 'Inverte le lettere interne delle parole nelle risposte. Prima e ultima restano al loro posto.' },
  { kind: 'fog', name: 'Nebbia', description: 'Copre le quattro risposte: un tocco su ciascuna per scoprirla, poi puoi sceglierla.' },
  { kind: 'shuffle', name: 'Shuffle', description: 'Scambia la posizione delle quattro risposte ogni secondo. Occhio a dove tocchi!' },
  { kind: 'spotlight', name: 'Riflettore', description: 'Mostra una risposta alla volta. Scorri tra le quattro prima di scegliere.' },
] as const

export const MAX_POWER_CARDS = 2
export const POWER_BASE_PROBABILITY = 0.2
export const SHUFFLE_INTERVAL_MS = 1_000

/** Reconstruct the same visual order after reconnecting, without changing answer IDs. */
export function shuffleAnswerOptions<T>(options: readonly T[], elapsedMs: number, questionKey: string): T[] {
  const result = [...options]
  let seed = 2166136261
  for (const character of questionKey) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0
  const steps = Math.max(0, Math.floor(elapsedMs / SHUFFLE_INTERVAL_MS))
  for (let step = 0; step < steps; step++) {
    for (let index = result.length - 1; index > 0; index--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      // Excluding index itself makes every answer move at each one-second step.
      const other = seed % index
      ;[result[index], result[other]] = [result[other], result[index]]
    }
  }
  return result
}

/** Equal scores have the same chance; k increases from 1 to 3 with rank. */
export function powerDropProbability(rank: number, players: number): number {
  return Math.min(0.6, POWER_BASE_PROBABILITY * (1 + 2 * (rank - 1) / Math.max(1, players - 1)))
}
