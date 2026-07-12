// Single source of truth for "does this entry need a human's attention?".
// Dashboard strip and show-map tree must agree, or users see contradictory
// counts for the same data.

import {
  countRawEntryManagementPendingBucket,
  isRawEntryInEntryManagementPendingBucket,
} from '@/utils/entryCountSelectors';

export type AttentionReason = 'pending_review';

export interface EntryLike {
  entry_status?: string | null;
  check_in_status?: string | null;
}

export function getEntryAttention(entry: EntryLike): AttentionReason | null {
  if (isRawEntryInEntryManagementPendingBucket(entry)) return 'pending_review';
  return null;
}

// Class-level attention reasons are tracked separately from entry-level
// AttentionReason: AttentionCounts (consumed by the secretary dashboard
// strip) is keyed strictly on entry reasons, so widening AttentionReason
// here would break that indexed lookup for a signal the dashboard doesn't
// render.
export type ClassAttentionReason = 'reopened_after_closeout';

export interface ClassLike {
  reopenedAfterCloseoutAt?: string | null | undefined;
}

// A class that reopened after being marked complete/closed still needs a
// secretary's eyes even though no individual entry is itself pending review
// (the new expected entry may already be scored). This is a class-level
// attention reason, distinct from getEntryAttention's entry-level reasons.
export function getClassAttention(cls: ClassLike): ClassAttentionReason | null {
  if (cls.reopenedAfterCloseoutAt) return 'reopened_after_closeout';
  return null;
}

export interface AttentionCounts {
  pending_review: number;
  total: number;
}

export function emptyAttentionCounts(): AttentionCounts {
  return { pending_review: 0, total: 0 };
}

export function countAttention(entries: readonly EntryLike[]): AttentionCounts {
  const pendingReview = countRawEntryManagementPendingBucket(entries);
  return { pending_review: pendingReview, total: pendingReview };
}
