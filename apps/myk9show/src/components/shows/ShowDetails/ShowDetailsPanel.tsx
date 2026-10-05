import React from 'react';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { PremiumDownloadCard } from '@/features/premium/PremiumDownloadCard';
import { LandingPageCard } from '@/features/premium/LandingPageCard';
import { SETUP_PUBLISH_ANCHOR } from '@/features/show-workbench/setupReadinessSignals';
import {
  LANDING_CARD_ANCHOR,
  PREMIUM_CARD_ANCHOR,
} from '@/features/show-workbench/publishReadiness';
import { getShowStyle } from '@/features/registries';
import { cn } from '@/lib/utils';
import { AboutThisShowCard } from '@/components/shows/overview/AboutThisShowCard';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { Show } from '@/types/show-types';

export const SHOW_DETAILS_PANEL_ID = 'show-details-panel';

/** Hash targets inside the panel: a link to one of them opens it. */
export const PUBLISH_PANEL_ANCHORS: ReadonlySet<string> = new Set([
  SETUP_PUBLISH_ANCHOR,
  PREMIUM_CARD_ANCHOR,
  LANDING_CARD_ANCHOR,
]);

interface ShowDetailsPanelProps {
  show: Show;
  canManageShow: boolean;
  /** `null` while entry counts are unavailable, so no false zero shows. */
  entryCount: number | null;
  judges?: ShowJudgeAssignment[] | undefined;
  open: boolean;
  /**
   * INTENT: the publish row lives on Overview ONLY (Richard, decision 2). It was an always-on row
   * on every section, which put the same two cards in front of a secretary who had navigated to
   * Reports or Results to do something else; the header Actions menu's "Generate & publish
   * premium" is the way back to it from anywhere.
   */
  showPublishing: boolean;
}

/**
 * What the old full hero carried under the show's name: entries, location, fee, payment methods,
 * and on Overview the Premium List and Public Landing Page cards. It sits under the one-line header
 * and slides open from its chevron. Kept mounted when closed, so the cards' own reads and the
 * `#setup-publish-premium` anchors exist whenever something links to them.
 */
export const ShowDetailsPanel: React.FC<ShowDetailsPanelProps> = ({
  show,
  canManageShow,
  entryCount,
  judges,
  open,
  showPublishing,
}) => (
  // Slides down and up by animating the grid row from 0fr to 1fr, so no height is measured; the
  // reduced-motion preference gets the instant version. `invisible` (flipped at the END of the
  // close) keeps the closed panel out of the tab order and the accessibility tree. The `!` margins
  // beat the page shell's `space-y-*`, which would otherwise leave a gap above a closed panel.
  <div
    id={SHOW_DETAILS_PANEL_ID}
    className={cn(
      'grid transition-[grid-template-rows,opacity,margin,visibility] duration-200 ease-out motion-reduce:transition-none',
      open
        ? 'visible !mt-3 grid-rows-[1fr] opacity-100'
        : 'invisible !mt-0 grid-rows-[0fr] opacity-0'
    )}
  >
    <section aria-label="Show details" className="min-h-0 space-y-3 overflow-hidden px-px">
      <div className="rounded-lg border bg-card">
        <QuickInfoCards show={show} canManageShow={canManageShow} entryCount={entryCount} />
      </div>
      {showPublishing && (
        <div
          id={SETUP_PUBLISH_ANCHOR}
          // `scroll-mt-20` only: a router `<Link>` to `#setup-publish` is a pushState, not
          // fragment navigation, so `target:` styles never fire (MYK9-630 round 5). Scrolling
          // still works.
          className="grid scroll-mt-20 grid-cols-1 gap-3 rounded-md sm:grid-cols-2"
        >
          <PremiumDownloadCard
            showId={show.id}
            showStaleBadge={true}
            canManageShow={canManageShow}
          />
          <LandingPageCard showId={show.id} showStyle={getShowStyle(show)} />
        </div>
      )}
      {showPublishing && <AboutThisShowCard show={show} judges={judges} />}
    </section>
  </div>
);
