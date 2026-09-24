// The jsonb `restore_dog` returns (migration 20260924104100, MYK9-607).
//
// A placement snapshotted by force_delete_dog is NOT given back when another
// live entry in that manual class holds it now: the secretary set that after
// the delete, and a hand-set order is never overridden automatically. Those
// placements come back in `placementsSkipped` so the admin can be told which
// class needs a human to re-check it.

export interface SkippedPlacement {
  entryId: string;
  classId: string;
  className: string | null;
  finalPlacement: number;
}

export interface RestoreDogResult {
  dogId: string;
  entriesRestored: number;
  placementsReapplied: number;
  placementsSkipped: SkippedPlacement[];
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function parseRestoreDogResult(raw: unknown): RestoreDogResult | null {
  const row = asRecord(raw);
  if (!row || typeof row.dog_id !== 'string') return null;

  const skipped = Array.isArray(row.placements_skipped) ? row.placements_skipped : [];
  return {
    dogId: row.dog_id,
    entriesRestored: asCount(row.entries_restored),
    placementsReapplied: asCount(row.placements_reapplied),
    placementsSkipped: skipped.flatMap(item => {
      const s = asRecord(item);
      if (
        !s ||
        typeof s.entry_id !== 'string' ||
        typeof s.class_id !== 'string' ||
        typeof s.final_placement !== 'number'
      ) {
        return [];
      }
      return [
        {
          entryId: s.entry_id,
          classId: s.class_id,
          className: typeof s.class_name === 'string' ? s.class_name : null,
          finalPlacement: s.final_placement,
        },
      ];
    }),
  };
}
