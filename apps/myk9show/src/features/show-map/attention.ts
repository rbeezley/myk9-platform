// Single source of truth for "does this entry need a human's attention?".
// Dashboard strip and show-map tree must agree, or users see contradictory
// counts for the same data.

export type AttentionReason = 'pending_review' | 'check_in_conflict';

export interface EntryLike {
  entry_status?: string | null;
  check_in_status?: string | null;
}

// Priority order: check_in_conflict beats pending_review because a same-day
// conflict blocks ring time, while pending review is asynchronous queue work.
export function getEntryAttention(entry: EntryLike): AttentionReason | null {
  if (entry.check_in_status === 'conflict') return 'check_in_conflict';
  if (entry.entry_status === 'submitted') return 'pending_review';
  return null;
}

export interface AttentionCounts {
  pending_review: number;
  check_in_conflict: number;
  total: number;
}

export function emptyAttentionCounts(): AttentionCounts {
  return { pending_review: 0, check_in_conflict: 0, total: 0 };
}

export function countAttention(entries: readonly EntryLike[]): AttentionCounts {
  const counts = emptyAttentionCounts();
  for (const entry of entries) {
    const reason = getEntryAttention(entry);
    if (!reason) continue;
    counts[reason]++;
    counts.total++;
  }
  return counts;
}
