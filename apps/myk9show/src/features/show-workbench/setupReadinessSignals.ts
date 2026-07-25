import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowWorkbenchClassSummary } from './showWorkbenchTypes';
import { classifyPremiumPublishState, type PremiumPublishStateInput } from './premiumPublishState';
import {
  isShowListingLive,
  PREMIUM_CARD_ANCHOR,
  SHOW_STATUS_CONTROL_ANCHOR,
} from './publishReadiness';
import { getClassManagementHref } from '@/components/classes/classManagementFilters';

export type SetupReadinessSignalId =
  | 'show-details-missing'
  | 'no-trials'
  | 'no-classes'
  | 'judges-missing'
  | 'show-not-visible'
  | 'exhibitor-materials-unpublished'
  | 'landing-content-unpublished';

export interface SetupReadinessSignal {
  id: SetupReadinessSignalId;
  label: string;
  /** Where the secretary fixes this — a route, or an in-page anchor ("#..."). */
  href: string;
}

// Anchor id for the publish section. The cards render in the shared manager
// shell on the primary Overview, so exception links can land on the existing
// publishing controls without reviving a Setup-only destination.
export const SETUP_PUBLISH_ANCHOR = 'setup-publish';

export interface SetupReadinessInput {
  show: Show;
  trials: SyncableTrial[];
  classes: ShowWorkbenchClassSummary[];
  judges: unknown[];
  /**
   * Fresher premium-publish columns fetched directly (usePublishInfo). The
   * replicated show row doesn't carry published_premium_url/at, so without
   * this override a published premium would always read as unpublished.
   */
  premiumInfo?: PremiumPublishStateInput & { experienceIsPublished?: boolean | null };
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function showDetailsComplete(show: Show): boolean {
  return (
    hasText(show.name) &&
    hasText(show.organization) &&
    hasText(show.startDate) &&
    hasText(show.endDate) &&
    hasText(show.location) &&
    hasText(show.clubName)
  );
}

function judgesAssigned(input: SetupReadinessInput): boolean {
  if (input.judges.length > 0) return true;
  return input.classes.length > 0 && input.classes.every(cls => hasText(cls.judgeName));
}

// INTENT: Mirror the Show Desk adaptive header's pending-signals contract —
// only emit a signal when it's NOT yet satisfied. Once the secretary
// finishes the setup step, the chip disappears instead of staying as a
// permanent "green check" item the eye has to filter past every visit.
// Every signal carries an href: a chip that names a problem without
// taking the secretary to the fix is the "wondering what to do next"
// anti-reference from PRODUCT.md.
export function computeSetupReadinessSignals(input: SetupReadinessInput): SetupReadinessSignal[] {
  const signals: SetupReadinessSignal[] = [];
  const showId = input.show.id;
  const firstTrialId = input.trials[0]?.id;
  // Classes and judges are managed per trial; until a trial exists, the
  // Trials tab is the right starting point for both. Route through the
  // canonical Class Management href builder (not a hand-assembled path) so
  // this link stays consistent with the surface's own normalizer even though
  // neither signal maps to a curated status filter today.
  const classWorkHref = firstTrialId
    ? getClassManagementHref({ showId, trialId: firstTrialId })
    : `/shows/${showId}?tab=trials`;
  if (!showDetailsComplete(input.show)) {
    signals.push({
      id: 'show-details-missing',
      label: 'Show details incomplete',
      href: `/shows/${showId}?edit=true`,
    });
  }
  if (input.trials.length === 0) {
    signals.push({
      id: 'no-trials',
      label: 'No trials yet',
      href: `/shows/${showId}?tab=trials`,
    });
  }
  if (input.classes.length === 0) {
    signals.push({ id: 'no-classes', label: 'No classes built', href: classWorkHref });
  }
  if (!judgesAssigned(input)) {
    signals.push({ id: 'judges-missing', label: 'Judges not assigned', href: classWorkHref });
  }
  if (!isShowListingLive(input.show.status)) {
    signals.push({
      id: 'show-not-visible',
      label: 'Show not visible to exhibitors',
      href: `#${SHOW_STATUS_CONTROL_ANCHOR}`,
    });
  }
  const premiumState = classifyPremiumPublishState(input.premiumInfo ?? input.show);
  if (premiumState === 'published-stale') {
    signals.push({
      id: 'exhibitor-materials-unpublished',
      label: 'Premium changed since publish',
      href: `#${PREMIUM_CARD_ANCHOR}`,
    });
  } else if (premiumState === 'unpublished') {
    signals.push({
      id: 'exhibitor-materials-unpublished',
      label: 'Premium not published yet',
      href: `#${PREMIUM_CARD_ANCHOR}`,
    });
  }
  // Publishing the premium also snapshots the landing content, so while a
  // premium signal is open its fix clears both — a separate landing chip
  // would be a duplicate task. Only when the PDF is current but the
  // experience snapshot is not published (the snapshot write failed) does
  // the landing chip appear, and it points at the premium card, which is
  // where the "Publish landing page" action lives (PremiumDownloadCard) —
  // the landing card itself has no publish control, so linking there would
  // be a dead end.
  const experienceIsPublished =
    input.premiumInfo?.experienceIsPublished ?? input.show.experienceIsPublished;
  if (premiumState === 'published-current' && !experienceIsPublished) {
    signals.push({
      id: 'landing-content-unpublished',
      label: 'Landing page not published',
      href: `#${PREMIUM_CARD_ANCHOR}`,
    });
  }
  return signals;
}

export function isSetupReady(input: SetupReadinessInput): boolean {
  return computeSetupReadinessSignals(input).length === 0;
}
