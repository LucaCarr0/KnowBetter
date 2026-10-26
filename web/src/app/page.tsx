import { GamePhases } from '@/features/home/components/game-phases'
import { HeroIntro } from '@/features/home/components/hero-intro'
import { SiteFooter } from '@/features/home/components/site-footer'
import { SiteHeader } from '@/features/home/components/site-header'
import { SessionShell } from '@/features/session/session-shell'

export default function Page() {
  return (
    <SessionShell header={<SiteHeader />} intro={<HeroIntro />} phases={<GamePhases />} footer={<SiteFooter />} />
  )
}
