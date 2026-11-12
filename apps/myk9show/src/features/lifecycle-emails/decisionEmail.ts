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
 * The entries one decision email covers, in a fixed order (by id) so the same set always
 * yields the same first entry and the same key. All share one registration.
 */
export function sortDecidedEntries(entries: EntryManagementEntry[]): EntryManagementEntry[] {
  return [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The key for ONE email covering several entries of a registration decided together:
 * registration + step + the sorted decided entry ids. The job is anchored on the first of
 * those ids (the table wants an entry_id), and a repeat of the same Accept builds the same
 * key, so the server's unique index refuses a second email. One entry keeps the entry's own
 * key, so it matches an email already saved or sent for that entry by any path.
 */
export function buildDecisionEmailKeyForEntries(
  entries: EntryManagementEntry[],
  stepType: DecisionStepType,
  correctionForJobId?: string | null
): string {
  const [first, ...rest] = sortDecidedEntries(entries);
  if (!first) throw new Error('A decision email needs at least one entry');
  if (rest.length === 0)
    return buildDecisionEmailIdempotencyKey(first, stepType, correctionForJobId);
  return buildLifecycleEmailIdempotencyKey({
    showId: first.showId,
    stepType,
    recipientScope: 'enrollment',
    entryId: first.id,
    enrollmentId: first.registrationId,
    batchKey: `${first.registrationId}:decided:${[first, ...rest].map(entry => entry.id).join(',')}`,
    correctionForJobId: correctionForJobId ?? null,
  });
}

function entryContext(entry: EntryManagementEntry): LifecycleEmailEntryContext {
  return {
    dogName: entry.dogName,
    className: entry.classes[0]?.name ?? null,
    armbandNumber: entry.armbandNumber ?? null,
    amountDue: Math.max(0, entry.totalFee - entry.paidAmount),
  };
}

/**
 * What a decision email is written from. The preview and the automatic send both build
 * their draft from this, so the email she would have previewed is the email that goes.
 * Given several entries of one registration it lists every class in one email; given one
 * (or an array of one) the context is exactly what it always was.
 */
export function decisionEmailContext(
  entryOrEntries: EntryManagementEntry | EntryManagementEntry[],
  showName: string | undefined
): {
  show: LifecycleEmailShowContext;
  recipient: { name?: string | null; email?: string | null };
  entry: LifecycleEmailEntryContext;
} {
  const entries = sortDecidedEntries(
    Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries]
  );
  const first = entries[0];
  if (!first) throw new Error('A decision email needs at least one entry');
  const context = entryContext(first);
  if (entries.length > 1) {
    context.alsoDecided = entries.slice(1).map(entryContext);
    // Each entry is billed on its own: the email states what is owed across the ones listed.
    context.amountDue = entries.reduce(
      (total, entry) => total + Math.max(0, entry.totalFee - entry.paidAmount),
      0
    );
  }
  return {
    show: { name: showName ?? 'this show' },
    recipient: { name: first.ownerName, email: first.ownerEmail },
    entry: context,
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
    decidedEntries?: EntryManagementEntry[] | undefined;
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
  return (prompt.decidedEntries ?? [prompt.entry]).some(decided => {
    const current = entries.find(entry => entry.id === decided.id)?.entryStatus;
    return current !== undefined && current !== expected;
  });
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
