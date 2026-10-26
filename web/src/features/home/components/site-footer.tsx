import { Link2, LockKeyhole } from 'lucide-react'

export function SiteFooter() {
  return (
    <footer className="flex flex-col gap-4 border-t border-white/10 py-6 text-xs font-semibold text-[#777da4] sm:flex-row sm:items-center sm:justify-between">
      <p>Made for loud friends and quiet geniuses.</p>
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5"><LockKeyhole className="size-3.5" aria-hidden="true" /> Private rooms</span>
        <span className="flex items-center gap-1.5"><Link2 className="size-3.5" aria-hidden="true" /> Share with a link</span>
      </div>
    </footer>
  )
}
