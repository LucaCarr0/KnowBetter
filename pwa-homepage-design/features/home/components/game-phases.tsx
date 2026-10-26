import { Zap } from 'lucide-react'

const phases = [
  {
    number: '01',
    title: 'Warm up',
    copy: 'Answer five trivia rounds and fight for the fastest fingers.',
    color: 'bg-[#ffd166]',
  },
  {
    number: '02',
    title: 'Level up',
    copy: 'Beat a mini-challenge to unlock your question in each of five rounds.',
    color: 'bg-[#b8e36d]',
  },
  {
    number: '03',
    title: 'Make your move',
    copy: 'Race to the finish and curse your way past the competition.',
    color: 'bg-[#a6e7ff]',
  },
] as const

export function GamePhases() {
  return (
    <section id="how-it-works" aria-labelledby="game-phases-heading" className="border-t border-white/10 py-12 lg:py-16">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff7657]">The game plan</p>
          <h2 id="game-phases-heading" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Three phases. One winner.</h2>
        </div>
        <span className="hidden text-sm font-semibold text-[#abb1d0] sm:block">Ready when your crew is.</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {phases.map(({ number, title, copy, color }) => (
          <article key={number} className={`daisy-card rounded-2xl p-5 text-[#10142f] ${color}`}>
            <div className="flex items-start justify-between">
              <span className="text-sm font-black opacity-60">{number}</span>
              <Zap className="size-5" aria-hidden="true" />
            </div>
            <h3 className="mt-8 text-xl font-black">{title}</h3>
            <p className="mt-2 max-w-xs text-sm font-semibold leading-relaxed opacity-75">{copy}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
