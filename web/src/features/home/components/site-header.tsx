export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 py-5 lg:py-7">
      <a href="#top" className="flex items-center gap-3" aria-label="Know Better home">
        <span className="grid size-10 shrink-0 rotate-3 place-items-center rounded-xl bg-[#ff7657] text-xl shadow-[4px_4px_0_#8d3654]" aria-hidden="true">?</span>
        <span className="text-xl font-black tracking-[-0.06em] sm:text-2xl">
          KNOW BETTER<span className="text-[#ffd166]">.</span>
        </span>
      </a>
      <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-5 text-xs font-semibold text-[#abb1d0] sm:text-sm">
        <a className="hidden transition-colors hover:text-white sm:inline" href="#how-it-works">How it works</a>
        <a className="transition-colors hover:text-white" href="#room-access">Join game</a>
      </nav>
    </header>
  )
}
