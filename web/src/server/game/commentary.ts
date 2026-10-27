type AnswerResult = 'correct' | 'wrong' | 'missing'

export interface JerryCommentaryContext {
  round: number
  totalRounds: number
  players: Array<{
    id: string
    nickname: string
    pointsBefore: number
    pointsAfter: number
    retired: boolean
    answer: AnswerResult
    previousAnswer: AnswerResult | null
  }>
}

export function buildJerryCommentary({ round, totalRounds, players }: JerryCommentaryContext): string[] {
  const active = players.filter(player => !player.retired)
  if (active.length === 0) return []

  const lines: string[] = []
  const pick = (variants: string[]) => variants[(round - 1) % variants.length]
  const highestBefore = Math.max(...active.map(player => player.pointsBefore))
  const lowestBefore = Math.min(...active.map(player => player.pointsBefore))
  const highestAfter = Math.max(...active.map(player => player.pointsAfter))
  const previousLeaders = active.filter(player => player.pointsBefore === highestBefore)
  const previousLeader = previousLeaders.length === 1 ? previousLeaders[0] : null

  if (round > 1 && previousLeader && previousLeader.pointsAfter < highestAfter) {
    const newLeader = active.find(player => player.pointsAfter === highestAfter)!
    lines.push(pick([
      `${newLeader.nickname} scalza ${previousLeader.nickname} dalla vetta: quel trono aveva le ruote!`,
      `${previousLeader.nickname}, la vetta è passata a ${newLeader.nickname}: avevi lasciato le chiavi sul tabellone!`,
      `${newLeader.nickname} sorpassa ${previousLeader.nickname}: io almeno avrei messo la freccia!`,
      `${previousLeader.nickname} perde la testa della classifica, ${newLeader.nickname} la raccoglie: che servizio!`,
      `${newLeader.nickname} prende il comando da ${previousLeader.nickname}: il trono non aveva la cintura!`,
    ]))
  }

  const correctCount = active.filter(player => player.answer === 'correct').length
  if (correctCount === 0) {
    lines.push(pick([
      'Nessuna risposta giusta: devo fare anche il concorrente oltre al presentatore?',
      'Zero risposte giuste: il tabellone riposa, il mio talento fa gli straordinari!',
      'Nessuno indovina: fortuna che il carisma di Jerry tiene in piedi lo spettacolo!',
      'Nessuna risposta corretta: il punto più alto del round resta la mia pettinatura!',
      'Zero risposte giuste: se serviva un esempio, bastava chiedere a me!',
    ]))
  } else if (correctCount === active.length) {
    lines.push(pick([
      'Tutti hanno indovinato: vedo che ascoltare Jerry migliora la cultura generale!',
      'Tutte risposte giuste: quasi quasi vi lascio presentare, ma il carisma chi ce lo mette?',
      'Tutti a segno: vi concedo un applauso, il prossimo resta per me!',
      'Nessun errore: con un presentatore così era il minimo!',
      'Tutti hanno indovinato: il tabellone applaude, io accetto il merito!',
    ]))
  }

  if (round > 1 && lowestBefore < highestBefore && lines.length < 2) {
    const repeatedMiss = active.find(player => player.pointsBefore === lowestBefore && player.answer === 'wrong' && player.previousAnswer === 'wrong')
    if (repeatedMiss) {
      lines.push(pick([
        `${repeatedMiss.nickname}, ancora un errore dal fondo della classifica: almeno la costanza merita un applauso!`,
        `${repeatedMiss.nickname} sbaglia ancora dal fondo: il tasto giusto non si offende se lo premi!`,
        `${repeatedMiss.nickname}, un altro errore dal fondo: quel posto non dà punti fedeltà!`,
        `${repeatedMiss.nickname} sbaglia di nuovo dal fondo: io il bis lo concedo solo agli applausi!`,
        `${repeatedMiss.nickname}, ancora un errore dal fondo: la rimonta aspetta il tuo prossimo squillo!`,
      ]))
    }
  }

  if (lines.length === 0) {
    lines.push(round === totalRounds
      ? 'Fase conclusa: punti sul tabellone, applausi al sottoscritto!'
      : pick([
        'Classifica aggiornata: il mio talento resta fuori concorso!',
        'Avete i punti, io ho il carisma: mi sembra uno scambio equo!',
        'Il tabellone fa i conti, io faccio spettacolo!',
        "Occhi alla classifica: per gli autografi di Jerry c'è tempo dopo!",
        'Fine round: il tabellone cambia, la mia modestia resta imbattibile!',
      ]))
  }

  return lines.slice(0, 2)
}
