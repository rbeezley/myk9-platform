import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { showDateRangeStatus } from '@/utils/date-format';
import type { LifecycleEmailEntryContext, LifecycleEmailShowContext } from './render';
import { buildLifecycleEmailIdempotencyKey, type LifecycleEmailStepType } from './types';

export type DecisionStepType = Extract<LifecycleEmailStepType, 'accepted' | 'waitlisted'>;

interface EntryDecisionLifecycleEmailIdempotencyKeyArgs {
  showId: string;
  stepType: DecisionStepType;
  entryId: string;
  enrollmentId?: string | null | undefined;
  correctionForJobId?: string | null | undefined;
}

export function buildEntryDecisionLifecycleEmailIdempotencyKey({
  showId,
  stepType,
  entryId,
  enrollmentId,
  correctionForJobId,
}: EntryDecisionLifecycleEmailIdempotencyKeyArgs): string {
  return buildLifecycleEmailIdempotencyKey({
    showId,
    stepType,
    recipientScope: 'enrollment',
    entryId,
    enrollmentId: enrollmentId ?? null,
    correctionForJobId: correctionForJobId ?? null,
  });
}

/** The key for an entry's own decision email (not a correction). */
export function buildDecisionEmailIdempotencyKey(
  entry: EntryManagementEntry,
  stepType: DecisionStepType,
  correctionForJobId?: string | null
): string {
  return buildEntryDecisionLifecycleEmailIdempotencyKey({
    showId: entry.showId,
    stepType,
    entryId: entry.id,
    enrollmentId: entry.registrationId,
    correctionForJobId: correctionForJobId ?? null,
  });
}

/**
 * What a decision email is written from. The preview and the automatic send both build
 * their draft from this, so the email she would have previewed is the email that goes.
 */
export function decisionEmailContext(
  entry: EntryManagementEntry,
  showName: string | undefined
): {
  show: LifecycleEmailShowContext;
  recipient: { name?: string | null; email?: string | null };
  entry: LifecycleEmailEntryContext;
} {
  return {
    show: { name: showName ?? 'this show' },
    recipient: { name: entry.ownerName, email: entry.ownerEmail },
    entry: {
      dogName: entry.dogName,
      className: entry.classes[0]?.name ?? null,
      armbandNumber: entry.armbandNumber ?? null,
      amountDue: Math.max(0, entry.totalFee - entry.paidAmount),
    },
  };
}

/**
 * A fresh decision email (right after an Accept/Waitlist) is stale if the secretary then
 * Undoes that status change — sending it would announce a decision that no longer holds.
 * Returns true when the entry's CURRENT status no longer matches what the email represents
 * (the same supersession principle the bulk/undo path uses). Ready-job reviews and
 * corrections intentionally reference a prior decision, so they are exempt.
 */
export function isDecisionEmailSuperseded(
  prompt: {
    entry: EntryManagementEntry;
    stepType: DecisionStepType;
    jobId?: string | null | undefined;
    correctionForJobId?: string | null | undefined;
  },
  entries: EntryManagementEntry[]
): boolean {
  if (prompt.jobId || prompt.correctionForJobId) return false;
  const expected =
    prompt.stepType === 'accepted'
      ? EntryStatus.ACCEPTED
      : prompt.stepType === 'waitlisted'
        ? EntryStatus.WAITLIST
        : undefined;
  if (!expected) return false;
  const current = entries.find(entry => entry.id === prompt.entry.id)?.entryStatus;
  return current !== undefined && current !== expected;
}

const LIVE_SHOW_STATUSES = ['published', 'upcoming', 'in_progress'];

/**
 * Whether a decision on this show's entries is emailed with no preview (owner decision
 * 2026-11-09, MYK9-1800): only a published show that has not finished. On a draft, a
 * completed or cancelled show, or one whose last day has passed, an Accept is more likely
 * setup, practice or tidying up, so the preview stays as the stop before a real person is
 * emailed. An unknown show is treated the same way.
 */
export function showSendsDecisionEmailsUnasked(
  show: { status?: string | null; endDate?: string | null } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!show || !LIVE_SHOW_STATUSES.includes((show.status ?? '').toLowerCase())) return false;
  // Live through the whole of its last day, by the same rule the show lists use.
  return !show.endDate || showDateRangeStatus(show.endDate, show.endDate, now) !== 'past';
}
