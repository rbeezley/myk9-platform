/**
 * MYK9-979: whether the styled public landing is showing a mail-in-only show
 * (shows.online_entries_enabled = false).
 *
 * ShowPublicLanding withholds every landing's Enter CTA for such a show (the
 * same `entryWindowNotOpen` gate all eight styles already read) and provides
 * this flag, so the sections that explain WHY entry is unavailable say "enter
 * by mail or at the show" instead of "the secretary still needs to assign
 * classes". A context rather than a prop: the explanation lives in eleven
 * section components across the eight styles, two or three levels below the
 * landing page that knows the show.
 */
import { createContext, useContext } from 'react';
import { MAIL_IN_ENTRY_NOTE } from '@/features/payments/onlineEntryGate';

export const LandingMailInContext = createContext(false);

export function useLandingMailInOnly(): boolean {
  return useContext(LandingMailInContext);
}

/** The landing navigation's status label when it has no Enter CTA and entries
 * are not closed (Codex round 4 on #2707): a mail-in show is not "pending". */
export const MAIL_IN_NAV_LABEL = 'Mail-in entries';

export function pendingNavLabel(mailInOnly: boolean): string {
  return mailInOnly ? MAIL_IN_NAV_LABEL : 'Classes pending';
}

/** The pending-entry sentence a landing section shows when it has no Enter CTA
 * and entries are not closed: the mail-in note on a mail-in show, otherwise
 * the section's own "classes not assigned yet" copy. */
export function pendingEntryCopy(mailInOnly: boolean, pendingClassesCopy: string): string {
  return mailInOnly ? MAIL_IN_ENTRY_NOTE : pendingClassesCopy;
}
