import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowWorkbenchClassSummary } from './showWorkbenchTypes';

export type SetupReadinessSignalId =
  | 'show-details-missing'
  | 'no-trials'
  | 'no-classes'
  | 'judges-missing'
  | 'exhibitor-materials-unpublished';

export interface SetupReadinessSignal {
  id: SetupReadinessSignalId;
  label: string;
  /** Where the secretary fixes this — a route, or an in-page anchor ("#..."). */
  href: string;
}

// Anchor id for the publish section. The cards render in ShowDetailsPage —
// the PARENT route that hosts the Setup page via <Outlet> — so the element
// is in the same document while /shows/:id/setup is active, and a `#`-href
// chip resolves to it. See ShowDetailsPage.tsx (id={SETUP_PUBLISH_ANCHOR})
// and the regression test in src/test/pages/ShowDetailsPage.test.tsx
// ("renders the #setup-publish anchor target on the Setup route ..."). Keep
// them nested: if the Setup route is ever un-nested, this anchor dies.
export const SETUP_PUBLISH_ANCHOR = 'setup-publish';

export interface SetupReadinessInput {
  show: Show;
  trials: SyncableTrial[];
  classes: ShowWorkbenchClassSummary[];
  judges: unknown[];
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

function exhibitorMaterialsPublished(show: Show): boolean {
  return Boolean(show.publishedPremiumUrl || show.publishedPremiumAt || show.experienceIsPublished);
}

// INTENT: Mirror the Show Desk adaptive header's pending-signals contract —
// only emit a signal when it's NOT yet satisfied. Once the secretary
// finishes the setup step, the chip disappears instead of staying as a
// permanent "green check" item the eye has to filter past every visit.
// Every signal carries an href: a chip that names a problem without
// taking the secretary to the fix is the "wondering what to do next"
// anti-reference from PRODUCT.md.
export function computeSetupReadinessSignals(
  input: SetupReadinessInput
): SetupReadinessSignal[] {
  const signals: SetupReadinessSignal[] = [];
  const showId = input.show.id;
  const firstTrialId = input.trials[0]?.id;
  // Classes and judges are managed per trial; until a trial exists, the
  // Trials tab is the right starting point for both.
  const classWorkHref = firstTrialId
    ? `/trials/${firstTrialId}/classes`
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
  if (!exhibitorMaterialsPublished(input.show)) {
    signals.push({
      id: 'exhibitor-materials-unpublished',
      label: 'Exhibitor info not published yet',
      href: `#${SETUP_PUBLISH_ANCHOR}`,
    });
  }
  return signals;
}

export function isSetupReady(input: SetupReadinessInput): boolean {
  return computeSetupReadinessSignals(input).length === 0;
}
