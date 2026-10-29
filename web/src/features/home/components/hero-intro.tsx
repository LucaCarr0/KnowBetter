import { Globe2, Sparkles, Users } from 'lucide-react'
import { TEXTS } from '../../../texts'

export function HeroIntro() {
  return (
    <div className="relative z-10 max-w-2xl">
      <div className="mb-7 inline-flex -rotate-2 items-center gap-2 rounded-full border border-[#ffd166]/35 bg-[#ffd166]/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffd166]">
        <Sparkles className="size-3.5" aria-hidden="true" /> {TEXTS.home.heroBadge}
      </div>
      <h1 className="max-w-3xl text-[clamp(3.9rem,10vw,8.5rem)] font-black leading-[.84] tracking-[-0.09em]">
        {TEXTS.home.heroTitle[0]}<br /><span className="text-[#ff7657]">{TEXTS.home.heroTitle[1]}</span><br />{TEXTS.home.heroTitle[2]}
      </h1>
      <p className="mt-8 max-w-md text-base leading-relaxed text-[#abb1d0] sm:text-lg">
        {TEXTS.home.heroCopy}
      </p>
      <div className="mt-9 flex flex-wrap gap-3 text-xs font-bold text-[#c6cae1]">
        <span className="flex items-center gap-2"><Users className="size-4 text-[#b8e36d]" aria-hidden="true" /> {TEXTS.home.heroPlayers}</span>
        <span className="flex items-center gap-2"><Globe2 className="size-4 text-[#a6e7ff]" aria-hidden="true" /> {TEXTS.home.heroRemote}</span>
      </div>
    </div>
  )
}
