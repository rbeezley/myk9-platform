import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import { formatDateLocal, parseLocalDateString } from '@/utils/dateLocal';

export interface EntryCloseSubmitGuardContext {
  startDate?: string | null | undefined;
  entryOpenDate?: string | null | undefined;
  entryCloseDate?: string | null | undefined;
  today?: string | undefined;
  isLateEntryMode: boolean;
  workflowMode: WorkflowMode;
}

export interface EntryCloseAvailability {
  canEnter: boolean;
  /** Which window boundary blocks entry, for boundary-specific UI copy. */
  unavailableReason: 'not_yet_open' | 'closed' | null;
  reason: string | null;
  recoveryHref: string;
}

function parseCalendarDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  return parseLocalDateString(value.split('T')[0] ?? value);
}

export function getEntryCloseSubmitBlocker({
  entryCloseDate,
  today,
  isLateEntryMode,
}: EntryCloseSubmitGuardContext): string | null {
  if (isLateEntryMode) return null;

  const closeDate = parseCalendarDate(entryCloseDate);
  if (!closeDate) return null;

  const currentDate = parseCalendarDate(today ?? formatDateLocal(new Date()));
  if (!currentDate) return null;

  if (currentDate.getTime() > closeDate.getTime()) {
    return 'Entries are closed for this show. Contact the trial secretary for late-entry help.';
  }

  return null;
}

/**
 * Blocks the exhibitor self-service path before entries open. Organizer
 * workflows (secretary/club_admin/site_admin) and explicit late-entry overrides
 * legitimately set up entries before the public open date, so they pass through.
 * Open date is inclusive: the whole open day onward is allowed, mirroring
 * entryStatusUtils' not_yet_open branch and canRegisterForShow.
 */
export function getEntryOpenSubmitBlocker({
  entryOpenDate,
  today,
  workflowMode,
}: EntryCloseSubmitGuardContext): string | null {
  // Only RBAC-derived organizer workflows are exempt. `isLateEntryMode` is
  // deliberately NOT honored here: it is set purely from URL params
  // (?source=show-desk&entryMode=late) that any exhibitor can append, and
  // "late entry" is a post-close concept with no pre-open meaning.
  if (workflowMode !== 'exhibitor') return null;

  const openDate = parseCalendarDate(entryOpenDate);
  if (!openDate) return null;

  const currentDate = parseCalendarDate(today ?? formatDateLocal(new Date()));
  if (!currentDate) return null;

  if (currentDate.getTime() < openDate.getTime()) {
    return 'Entries have not opened yet for this show. Check back on the entry open date.';
  }

  return null;
}

/**
 * Full submission gate: entries must have opened AND not yet closed. Returns the
 * first blocking reason (open before close) or null when submission is allowed.
 */
export function getEntrySubmitBlocker(context: EntryCloseSubmitGuardContext): string | null {
  return getEntryOpenSubmitBlocker(context) ?? getEntryCloseSubmitBlocker(context);
}

export function getEntryCloseAvailability(
  context: EntryCloseSubmitGuardContext & { showId: string }
): EntryCloseAvailability {
  const openReason = getEntryOpenSubmitBlocker(context);
  const reason = openReason ?? getEntryCloseSubmitBlocker(context);

  return {
    canEnter: reason === null,
    unavailableReason: reason === null ? null : openReason ? 'not_yet_open' : 'closed',
    reason,
    recoveryHref: `/messages/${context.showId}`,
  };
}
