import { EntryStatus } from '@/types/show-registration-types';
import type { EntryAttentionReason } from '@/features/entry-operations/attentionClassification';

/**
 * Canonical review-state vocabulary for the entry management cockpit
 * (queue rows, focused-card badge, status menus, bulk-action labels).
 *
 * Decision rule (see openspec/changes/entry-cockpit-action-grammar/design.md
 * D2): states are nouns/adjectives ("Accepted", "Pending", "Missing
 * information"); menu commands are verbs ("Accept", "Reject", "Mark missing
 * information"). "Reviewed" is retired in favor of "Accepted" — every
 * consumer must read its label from this module so the strings can't drift.
 */
export type RegistrationReviewState =
  | 'missing_information'
  | 'needs_review'
  | 'accepted'
  | 'not_accepted'
  | 'waitlisted'
  | 'withdrawn'
  | 'scratched'
  | 'moved'
  | 'complete'
  | 'move_up_requested'
  | 'mixed';

export type ReviewStateTone = 'accepted' | 'warning' | 'destructive' | 'neutral';

interface ReviewStateLabelEntry {
  label: string;
  tone: ReviewStateTone;
}

/** State → label/tone. States are nouns/adjectives, never verbs. */
export const REGISTRATION_REVIEW_STATE_LABELS: Record<
  RegistrationReviewState,
  ReviewStateLabelEntry
> = {
  missing_information: { label: 'Missing information', tone: 'destructive' },
  needs_review: { label: 'Needs review', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'accepted' },
  not_accepted: { label: 'Not accepted', tone: 'destructive' },
  waitlisted: { label: 'Waitlisted', tone: 'warning' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  scratched: { label: 'Scratched', tone: 'neutral' },
  moved: { label: 'Moved', tone: 'neutral' },
  complete: { label: 'Complete', tone: 'accepted' },
  move_up_requested: { label: 'Move-up requested', tone: 'warning' },
  mixed: { label: 'Mixed statuses', tone: 'neutral' },
};

interface ReviewableRegistration {
  attentionReasons: EntryAttentionReason[];
  entries: ReadonlyArray<{ entryStatus: EntryStatus }>;
}

const STATUS_TO_REVIEW_STATE: Partial<Record<EntryStatus, RegistrationReviewState>> = {
  [EntryStatus.ACCEPTED]: 'accepted',
  [EntryStatus.REJECTED]: 'not_accepted',
  [EntryStatus.WAITLIST]: 'waitlisted',
  [EntryStatus.CANCELLED]: 'withdrawn',
  [EntryStatus.SCRATCHED]: 'scratched',
  [EntryStatus.MOVED]: 'moved',
  [EntryStatus.COMPLETED]: 'complete',
  [EntryStatus.MOVE_UP_REQUESTED]: 'move_up_requested',
};

/** Derive the single canonical review state for a registration group. */
export function getRegistrationReviewState(
  registration: ReviewableRegistration
): RegistrationReviewState {
  if (registration.attentionReasons.includes('missing_information')) {
    return 'missing_information';
  }
  if (registration.attentionReasons.includes('pending_review')) {
    return 'needs_review';
  }

  const statuses = [...new Set(registration.entries.map(entry => entry.entryStatus))];
  if (statuses.length !== 1) return 'mixed';
  return STATUS_TO_REVIEW_STATE[statuses[0]] ?? 'needs_review';
}

/** Canonical label for a registration group's review state. */
export function getRegistrationReviewLabel(registration: ReviewableRegistration): string {
  return REGISTRATION_REVIEW_STATE_LABELS[getRegistrationReviewState(registration)].label;
}

/** Canonical tone for a registration group's review state (for badge styling). */
export function getRegistrationReviewTone(registration: ReviewableRegistration): ReviewStateTone {
  return REGISTRATION_REVIEW_STATE_LABELS[getRegistrationReviewState(registration)].tone;
}

/**
 * Verb-command labels for status-change menu items and bulk actions.
 * These are commands ("Accept"), never state nouns ("Accepted").
 */
export type CommandableEntryStatus =
  | EntryStatus.ACCEPTED
  | EntryStatus.PENDING
  | EntryStatus.MISSING_INFO
  | EntryStatus.SCRATCHED
  | EntryStatus.REJECTED;

export const STATUS_COMMAND_LABELS: Record<CommandableEntryStatus, string> = {
  [EntryStatus.ACCEPTED]: 'Accept',
  [EntryStatus.PENDING]: 'Mark pending',
  [EntryStatus.MISSING_INFO]: 'Mark missing information',
  [EntryStatus.SCRATCHED]: 'Pull',
  [EntryStatus.REJECTED]: 'Reject',
};

/**
 * Bulk-action command labels ("Accept all", "Reject all", "Mark all missing
 * information") — deliberately not derived from `STATUS_COMMAND_LABELS` via a
 * shared "{command} all" template, since that produces ungrammatical results
 * for multi-word commands (e.g. "Mark missing information all").
 */
export const BULK_COMMAND_LABELS: Record<CommandableEntryStatus, string> = {
  [EntryStatus.ACCEPTED]: 'Accept all',
  [EntryStatus.PENDING]: 'Mark all pending',
  [EntryStatus.MISSING_INFO]: 'Mark all missing information',
  [EntryStatus.SCRATCHED]: 'Pull all',
  [EntryStatus.REJECTED]: 'Reject all',
};

/**
 * Canonical noun/adjective label for a single `EntryStatus` value — for
 * surfaces that mark an individual entry's *current* status (e.g. the
 * status-change menu's inert "current status" row). Reuses the same strings
 * as `REGISTRATION_REVIEW_STATE_LABELS` so a single entry's status label
 * can't drift from the registration-group vocabulary (e.g. "Waitlisted" not
 * "Wait list", "Complete" not "Completed") — never read status labels from
 * `getStatusDescriptor` for these surfaces.
 */
export const ENTRY_STATUS_STATE_LABELS: Record<EntryStatus, string> = {
  [EntryStatus.PENDING]: 'Pending',
  [EntryStatus.ACCEPTED]: REGISTRATION_REVIEW_STATE_LABELS.accepted.label,
  [EntryStatus.REJECTED]: REGISTRATION_REVIEW_STATE_LABELS.not_accepted.label,
  [EntryStatus.WAITLIST]: REGISTRATION_REVIEW_STATE_LABELS.waitlisted.label,
  [EntryStatus.CANCELLED]: REGISTRATION_REVIEW_STATE_LABELS.withdrawn.label,
  [EntryStatus.MISSING_INFO]: REGISTRATION_REVIEW_STATE_LABELS.missing_information.label,
  [EntryStatus.SCRATCHED]: REGISTRATION_REVIEW_STATE_LABELS.scratched.label,
  [EntryStatus.MOVED]: REGISTRATION_REVIEW_STATE_LABELS.moved.label,
  [EntryStatus.COMPLETED]: REGISTRATION_REVIEW_STATE_LABELS.complete.label,
  [EntryStatus.MOVE_UP_REQUESTED]: REGISTRATION_REVIEW_STATE_LABELS.move_up_requested.label,
};

/** Canonical label for a single entry's current status. */
export function getEntryStatusStateLabel(status: EntryStatus): string {
  return ENTRY_STATUS_STATE_LABELS[status] ?? status;
}
