// Show Map's legacy attention signal is intentionally narrow, but its predicate
// delegates to the shared operational classifier so it cannot drift from Entry
// Management as new entry reasons are added.

import {
  classifyClassAttention,
  classifyRawEntryAttention,
  type ClassAttentionReason,
} from '@/features/entry-operations/attentionClassification';

export type AttentionReason = 'pending_review';

export interface EntryLike {
  entry_status?: string | null;
  payment_status?: string | null;
  check_in_status?: string | null;
}

export function getEntryAttention(entry: EntryLike): AttentionReason | null {
  return classifyRawEntryAttention(entry).includes('pending_review') ? 'pending_review' : null;
}

// Class-level attention reasons are tracked separately from entry-level
// AttentionReason: AttentionCounts (consumed by the secretary dashboard
// strip) is keyed strictly on entry reasons, so widening AttentionReason
// here would break that indexed lookup for a signal the dashboard doesn't
// render.
export interface ClassLike {
  reopenedAfterCloseoutAt?: string | null | undefined;
}

// A class that reopened after being marked complete/closed still needs a
// secretary's eyes even though no individual entry is itself pending review
// (the new expected entry may already be scored). This is a class-level
// attention reason, distinct from getEntryAttention's entry-level reasons.
export function getClassAttention(cls: ClassLike): ClassAttentionReason | null {
  return classifyClassAttention(cls)[0] ?? null;
}

export interface AttentionCounts {
  pending_review: number;
  total: number;
}

export function emptyAttentionCounts(): AttentionCounts {
  return { pending_review: 0, total: 0 };
}

export function countAttention(entries: readonly EntryLike[]): AttentionCounts {
  const pendingReview = entries.filter(
    entry => getEntryAttention(entry) === 'pending_review'
  ).length;
  return { pending_review: pendingReview, total: pendingReview };
}
