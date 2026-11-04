import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { PremiumDownloadCard } from '@/features/premium/PremiumDownloadCard';
import { LandingPageCard } from '@/features/premium/LandingPageCard';
import {
  LANDING_CARD_ANCHOR,
  PREMIUM_CARD_ANCHOR,
} from '@/features/show-workbench/publishReadiness';
import {
  publishAnchorFromHash,
  SETUP_PUBLISH_ANCHOR,
} from '@/features/show-workbench/setupReadinessSignals';
import { resolveShowUses } from '@/features/show-workbench/showUses';
import { useShowWithLiveUses } from '@/features/show-workbench/useShowWithLiveUses';
import { getShowStyle } from '@/features/registries';
import { AboutThisShowCard } from '@/components/shows/overview/AboutThisShowCard';
import {
  ShowAboutEntries,
  ShowAboutWhere,
  ShowAboutWithdrawal,
} from '@/components/shows/about/ShowAboutFacts';
import { useShowManagementOutlet } from '@/components/shows/ShowDetails/showManagementOutlet';

/**
 * The About tab (MYK9-1683, MYK9-1608 part B): the show's facts and the publishing cards on a
 * labelled tab, replacing the header chevron's panel. READ-ONLY by design: nothing here edits in
 * place, and it is not a revival of the Setup tab MYK9-957 deleted. Changing a fact is "Edit show".
 * Manager-only: the route (`ShowManagementSectionRoute`) admits no one else.
 *
 * INTENT: the publish cards' ONE home is About (owner decision, 2026-11-03; it was the Overview
 * tab, decision 2). They were an always-on row on every section, which put the same two cards in
 * front of a secretary who had navigated to Reports or Results to do something else. MYK9-1298
 * removed the header Actions menu's "Generate & publish premium" row on purpose: these cards are
 * the ONE publish verb, reached from the status-line nudge and the readiness line, which both
 * land here and scroll to the right card. The trade-off: off About there is no publish shortcut.
 */
export default function ShowAboutPage() {
  const { show, canManageShow, judges, managerEntryCount } = useShowManagementOutlet();
  const { hash, key } = useLocation();
  const anchor = publishAnchorFromHash(hash);
  // MYK9-1686: no public landing page, no Landing page card. Premium stays; a link to the hidden
  // card's anchor falls back to it.
  const { usesLandingPage } = resolveShowUses(useShowWithLiveUses(show));
  const scrollTarget =
    anchor === LANDING_CARD_ANCHOR && !usesLandingPage ? PREMIUM_CARD_ANCHOR : anchor;

  // A router link to `#anchor` is a pushState, not fragment navigation, so the browser never
  // scrolls on its own. Keyed on the navigation (`key`) so a repeat click scrolls again.
  useEffect(() => {
    if (!scrollTarget) return;
    document.getElementById(scrollTarget)?.scrollIntoView({ block: 'start' });
  }, [scrollTarget, key]);

  return (
    <div className="space-y-3">
      <div
        id={SETUP_PUBLISH_ANCHOR}
        // `scroll-mt-20` only: `target:` styles never fire on a router `<Link>` (MYK9-630 round 5).
        className="grid scroll-mt-20 grid-cols-1 gap-3 rounded-md sm:grid-cols-2"
      >
        <PremiumDownloadCard showId={show.id} showStaleBadge={true} canManageShow={canManageShow} />
        {usesLandingPage && <LandingPageCard showId={show.id} showStyle={getShowStyle(show)} />}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ShowAboutWhere show={show} />
        <ShowAboutWithdrawal showId={show.id} />
      </div>
      <ShowAboutEntries
        show={show}
        canManageShow={canManageShow}
        entryCount={managerEntryCount ?? null}
      />
      <AboutThisShowCard show={show} judges={judges} />
      <Link
        to={`/secretary/messages?showId=${show.id}&view=email`}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
        Email delivery
      </Link>
    </div>
  );
}
