export function formatEntryCount(count: number | null): string {
  return count == null ? '—' : String(count);
}

export function entryCapacityPercent(count: number | null, limit: number | null): number | null {
  if (count == null || limit == null || limit <= 0) return null;
  return Math.min(100, Math.round((count / limit) * 100));
}
