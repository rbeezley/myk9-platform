import { isUnsetJudgeName } from '@/utils/classJudgeDisplay';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import { classifyPremiumPublishState, type PremiumPublishStateInput } from './premiumPublishState';
import {
  isShowListingLive,
  LANDING_CARD_ANCHOR,
  PREMIUM_CARD_ANCHOR,
  SHOW_STATUS_CONTROL_ANCHOR,
} from './publishReadiness';
import { resolveShowUses } from './showUses';
import { getSelectClassesHref } from '@/pages/secretary/selectClassesRoutes';

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

// Anchor id for the publish section. The cards live on the About tab (MYK9-1683),
// so exception links land on the existing publishing controls without reviving
// a Setup-only destination.
export const SETUP_PUBLISH_ANCHOR = 'setup-publish';

/** Hash targets on the About tab: a link to one of them opens About and scrolls to it. */
export const PUBLISH_PANEL_ANCHORS: ReadonlySet<string> = new Set([
  SETUP_PUBLISH_ANCHOR,
  PREMIUM_CARD_ANCHOR,
  LANDING_CARD_ANCHOR,
]);

/**
 * The publish card a location hash points at, or null. Cockpit attention links append
 * `?returnTo=` after their bare `#anchor`, so the router hands back `#anchor?returnTo=…` as the
 * hash; only the part before `?` names the card.
 */
export function publishAnchorFromHash(hash: string): string | null {
  const anchor = hash.replace(/^#/, '').split('?')[0] ?? '';
  return PUBLISH_PANEL_ANCHORS.has(anchor) ? anchor : null;
}

/** The only class fact the signals read; the full Show Desk class row is assignable to it. */
export interface SetupReadinessClass {
  judgeName?: string | undefined;
}

export interface SetupReadinessInput {
  show: Show;
  trials: SyncableTrial[];
  classes: SetupReadinessClass[];
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
  return input.classes.length > 0 && input.classes.every(cls => !isUnsetJudgeName(cls.judgeName));
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
  // Classes and judges are managed on Setup → Classes; until a trial exists, the
  // Trials tab is the right starting point for both.
  const classWorkHref = firstTrialId ? getSelectClassesHref(showId) : `/shows/${showId}`;
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
      href: `/shows/${showId}`,
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
  // MYK9-1686: a club that publishes its own premium list is never nudged to publish one here,
  // and a show without a public landing page has no landing snapshot to publish. Suppressing at
  // the source clears the Ready line and the Show Desk chip together.
  const { usesLandingPage, publishesOwnPremium } = resolveShowUses(input.show);
  const premiumState = classifyPremiumPublishState(input.premiumInfo ?? input.show);
  if (publishesOwnPremium) {
    // no premium nudge
  } else if (premiumState === 'published-stale') {
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
  // A club that publishes its own premium has no generated premium to wait on, so its landing
  // page warns on its own (a suppressed premium line must not hide an unpublished landing page).
  const premiumSettled = premiumState === 'published-current' || publishesOwnPremium;
  if (usesLandingPage && premiumSettled && !experienceIsPublished) {
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
