// Single source of truth for "does this entry need a human's attention?".
// Dashboard strip and show-map tree must agree, or users see contradictory
// counts for the same data.

export type AttentionReason = 'pending_review';

export interface EntryLike {
  entry_status?: string | null;
  check_in_status?: string | null;
}

export function getEntryAttention(entry: EntryLike): AttentionReason | null {
  if (entry.entry_status === 'submitted') return 'pending_review';
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
  const counts = emptyAttentionCounts();
  for (const entry of entries) {
    const reason = getEntryAttention(entry);
    if (!reason) continue;
    counts[reason]++;
    counts.total++;
  }
  return counts;
}
