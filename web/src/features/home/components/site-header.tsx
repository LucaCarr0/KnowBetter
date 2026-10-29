import { TEXTS } from '../../../texts'

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 py-5 lg:py-7">
      <a href="#top" className="flex items-center gap-3" aria-label={TEXTS.home.homeLinkLabel}>
        <span className="grid size-10 shrink-0 rotate-3 place-items-center rounded-xl bg-[#ff7657] text-xl shadow-[4px_4px_0_#8d3654]" aria-hidden="true">?</span>
        <span className="text-xl font-black tracking-[-0.06em] sm:text-2xl">
          {TEXTS.home.brand}<span className="text-[#ffd166]">.</span>
        </span>
      </a>
      <nav aria-label={TEXTS.home.navLabel} className="flex shrink-0 items-center gap-5 text-xs font-semibold text-[#abb1d0] sm:text-sm">
        <a className="hidden transition-colors hover:text-white sm:inline" href="#how-it-works">{TEXTS.home.navHowItWorks}</a>
        <a className="transition-colors hover:text-white" href="#room-access">{TEXTS.home.navJoin}</a>
      </nav>
    </header>
  )
}
