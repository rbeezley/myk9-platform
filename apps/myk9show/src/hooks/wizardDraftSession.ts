/**
 * Same-tab continuation marker for the registration wizard (MYK9-514/MYK9-509).
 *
 * MYK9-508 gave the exhibitor an explicit "Resume entry" panel for the
 * cross-visit case. A reload, and the full-page return from a cancelled Stripe
 * checkout, are a different thing entirely: the exhibitor never left. They
 * should not have to click Resume to get back what they were in the middle of.
 *
 * The rule that separates the two is a sessionStorage marker:
 *
 *  - sessionStorage is scoped to ONE tab and ONE origin. It survives a reload
 *    and a navigation away and back within that tab — including the Stripe
 *    round trip — and is empty in a new tab or a new browser session. That is
 *    exactly the "same sitting" boundary, and nothing else on the page knows it.
 *  - The key carries showId AND userId, so the marker left by one exhibitor's
 *    sitting can never authorise restoring another's, or another show's.
 *  - The draft it restores is picked from the same eligibility rule the Resume
 *    panel uses (dogs selected, not already completed) and must additionally be
 *    recent. A tab parked open for days is still "the same tab", but the fees
 *    and class availability behind a week-old draft are not worth restoring
 *    silently — that case falls back to the explicit Resume panel.
 *
 * Every accessor swallows its own errors: sessionStorage throws in private
 * mode and under blocked site data, and a wizard that cannot remember is far
 * better than a wizard that will not render.
 */

import type { DraftMetadata } from './draftMetadata';

/** Beyond this, a same-tab draft is offered through Resume rather than restored. */
export const WIZARD_SESSION_MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000;

export function wizardSessionKey(showId: string, userId: string): string {
  return `registration-wizard-open-${showId}-${userId}`;
}

export function markWizardSessionOpen(showId: string, userId: string): void {
  try {
    sessionStorage.setItem(wizardSessionKey(showId, userId), '1');
  } catch {
    // Private mode / blocked site data — the exhibitor just loses the restore.
  }
}

export function clearWizardSession(showId: string, userId: string): void {
  try {
    sessionStorage.removeItem(wizardSessionKey(showId, userId));
  } catch {
    // See above.
  }
}

export function hasWizardSession(showId: string, userId: string): boolean {
  try {
    return sessionStorage.getItem(wizardSessionKey(showId, userId)) !== null;
  } catch {
    return false;
  }
}

/**
 * The draft a same-tab return should restore, or null.
 *
 * Deliberately the SAME eligibility test the Resume panel applies (dogs
 * selected, not completed) plus the age bound, so the two surfaces can never
 * disagree about which draft is the live one.
 */
export function pickRehydratableDraft(
  drafts: readonly DraftMetadata[],
  now: number = Date.now()
): DraftMetadata | null {
  let best: DraftMetadata | null = null;
  for (const draft of drafts) {
    if ((draft.selectedDogsCount ?? 0) === 0) continue;
    if (draft.completed) continue;
    if (now - draft.timestamp > WIZARD_SESSION_MAX_DRAFT_AGE_MS) continue;
    if (!best || draft.timestamp > best.timestamp) best = draft;
  }
  return best;
}
