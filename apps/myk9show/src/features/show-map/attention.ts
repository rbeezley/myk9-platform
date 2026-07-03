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
