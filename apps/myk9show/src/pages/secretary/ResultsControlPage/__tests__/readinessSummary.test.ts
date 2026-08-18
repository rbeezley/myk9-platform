import { describe, expect, it } from 'vitest';
import type { SyncableClassData, SyncableEntryData } from '@/store/classStore';
import { mergeEntryData, replicatedToEntry } from '@/store/classStore';
import { rowToEntry, type EntryRow } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { buildResultsReadinessSummary } from '../readinessSummary';
import { fromAny } from '@total-typescript/shoehorn';

/**
 * Build a store entry the way the app actually does at runtime:
 * Supabase row -> rowToEntry -> replicatedToEntry.
 *
 * The hand-written `entry()` builder below cannot catch MYK9-118, because it
 * invents fields (`score`, `time`, `placement`, a result-bearing `status`) that
 * this chain never produces. `entries` has no `status` column at all, and
 * `replicatedToEntry` blanks the display trio as local-only — so readiness must
 * be decided from `is_scored` / `result_status`, and only a test driven through
 * the real mappers proves it.
 */
function storeEntryFromRow(row: Partial<EntryRow> & Record<string, unknown>): SyncableEntryData {
  return replicatedToEntry(rowToEntry(fromAny<EntryRow, unknown>(row)));
}

const scoredRow = {
  id: 'entry-scored',
  class_id: 'class-1',
  armband: '100',
  handler: 'Handler',
  entry_status: 'completed',
  is_scored: true,
  result_status: 'qualified',
  total_score: 100,
};

/**
 * `entries.result_status` is `DEFAULT 'pending'`, so an untouched entry is NOT
 * absent this column — it carries a non-empty value that means "no result yet".
 * Modelling that default is the whole point of this fixture: omitting it is how
 * a readiness check that merely tests `result_status !== ''` passes review and
 * still reports every show as ready to send.
 */
const unscoredRow = {
  id: 'entry-unscored',
  class_id: 'class-1',
  armband: '101',
  handler: 'Handler',
  entry_status: 'confirmed',
  is_scored: false,
  result_status: 'pending',
};

const synced = {
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced' as const,
};

function cls(overrides: Partial<SyncableClassData> = {}): SyncableClassData {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    trial: 'Trial A',
    trialDate: '2026-08-01',
    trialNumber: '1',
    classOrder: '1',
    status: 'Completed',
    judge: 'Judge',
    ...synced,
    ...overrides,
  };
}

function entry(overrides: Partial<SyncableEntryData> = {}): SyncableEntryData {
  return fromAny<SyncableEntryData, unknown>({
    id: 'entry-1',
    armband: '101',
    handler: 'Handler',
    dog: 'Dog',
    status: 'pending',
    score: '',
    time: '',
    placement: '',
    classId: 'class-1',
    ...synced,
    ...overrides,
  });
}

describe('buildResultsReadinessSummary', () => {
  it('counts unscored entries and unreleased classes', () => {
    expect(buildResultsReadinessSummary([cls()], [entry()])).toEqual({
      totalClasses: 1,
      totalEntries: 1,
      unscoredEntries: 1,
      unreleasedClasses: 1,
      safeToSend: false,
    });
  });

  it('marks a show safe when every entry is scored and every class is released', () => {
    expect(
      buildResultsReadinessSummary(
        [cls({ results_released_at: '2026-08-01T20:00:00Z' })],
        [entry({ status: 'Qualified', score: 'Q', time: '35.12', placement: '1' })]
      )
    ).toEqual({
      totalClasses: 1,
      totalEntries: 1,
      unscoredEntries: 0,
      unreleasedClasses: 0,
      safeToSend: true,
    });
  });

  describe('replication-mapped entries (MYK9-118)', () => {
    it('excludes a scored entry that came through the real mapper chain', () => {
      const summary = buildResultsReadinessSummary([cls()], [storeEntryFromRow(scoredRow)]);

      expect(summary.totalEntries).toBe(1);
      expect(summary.unscoredEntries).toBe(0);
    });

    it('still counts an unscored entry from the same chain', () => {
      const summary = buildResultsReadinessSummary([cls()], [storeEntryFromRow(unscoredRow)]);

      expect(summary.unscoredEntries).toBe(1);
    });

    it('counts only the unscored ones in a mixed class', () => {
      const entries = [
        storeEntryFromRow(scoredRow),
        storeEntryFromRow({ ...scoredRow, id: 'entry-scored-2', armband: '103' }),
        storeEntryFromRow(unscoredRow),
        storeEntryFromRow({ ...unscoredRow, id: 'entry-unscored-2', armband: '102' }),
      ];

      expect(buildResultsReadinessSummary([cls()], entries)).toMatchObject({
        totalEntries: 4,
        unscoredEntries: 2,
      });
    });

    it("does not treat the 'pending' result_status default as a result", () => {
      // entries.result_status is DEFAULT 'pending'. Accepting any non-empty
      // value here would mark every untouched entry as settled and report the
      // show safe to send — an inversion worse than the original bug, because
      // "0 unscored" is plausible where "514 unscored" was visibly wrong.
      const summary = buildResultsReadinessSummary(
        [cls({ results_released_at: '2026-08-01T20:00:00Z' })],
        [storeEntryFromRow(unscoredRow)]
      );

      expect(summary.unscoredEntries).toBe(1);
      expect(summary.safeToSend).toBe(false);
    });

    it('leaves an unrecognised result_status counted as outstanding', () => {
      const odd = storeEntryFromRow({
        ...unscoredRow,
        id: 'entry-odd',
        result_status: 'some-future-status',
      });

      expect(buildResultsReadinessSummary([cls()], [odd]).unscoredEntries).toBe(1);
    });

    it('treats a terminal result_status as a result even when is_scored is unset', () => {
      const absent = storeEntryFromRow({
        id: 'entry-absent',
        class_id: 'class-1',
        armband: '104',
        entry_status: 'completed',
        result_status: 'absent',
      });

      expect(buildResultsReadinessSummary([cls()], [absent]).unscoredEntries).toBe(0);
    });

    it('survives the merge path the subscription actually uses', () => {
      // initializeSubscription calls mergeEntryData, not replicatedToEntry, and
      // it re-applies the previous entry's local-only display fields on every
      // tick. The scoring facts must not be lost in that overlay.
      const replicated = rowToEntry(fromAny<EntryRow, unknown>(scoredRow));
      const existing = replicatedToEntry(rowToEntry(fromAny<EntryRow, unknown>(unscoredRow)));

      const merged = mergeEntryData(replicated, existing);

      expect(merged.isScored).toBe(true);
      expect(buildResultsReadinessSummary([cls()], [merged]).unscoredEntries).toBe(0);
    });

    it.each([
      ['withdrawn', { entry_status: 'withdrawn' }],
      ['scratched', { entry_status: 'scratched' }],
      ['cancelled', { entry_status: 'cancelled' }],
      ['pulled at check-in', { check_in_status: 'pulled' }],
      ['soft-deleted', { deleted_at: '2026-08-01T12:00:00Z' }],
    ])('does not let a %s entry block closeout', (_label, overrides) => {
      // These keep result_status at its 'pending' default, so counting them
      // would leave safeToSend unreachable for any show with a routine
      // withdrawal — the same dead end MYK9-118 reports, by another route.
      const summary = buildResultsReadinessSummary(
        [cls({ results_released_at: '2026-08-01T20:00:00Z' })],
        [storeEntryFromRow(scoredRow), storeEntryFromRow({ ...unscoredRow, ...overrides })]
      );

      expect(summary.unscoredEntries).toBe(0);
      expect(summary.safeToSend).toBe(true);
    });

    it('reaches safeToSend once every mapped entry is scored and the class is released', () => {
      const summary = buildResultsReadinessSummary(
        [cls({ results_released_at: '2026-08-01T20:00:00Z' })],
        [storeEntryFromRow(scoredRow)]
      );

      expect(summary).toEqual({
        totalClasses: 1,
        totalEntries: 1,
        unscoredEntries: 0,
        unreleasedClasses: 0,
        safeToSend: true,
      });
    });
  });
});
