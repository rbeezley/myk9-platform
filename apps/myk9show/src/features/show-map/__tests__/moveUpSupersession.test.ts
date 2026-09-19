import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasRunStarted, resolveMoveUpReversal, reverseShowMapMoveUp } from '../moveUpSupersession';
import { rowToEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mockGetEntryById = vi.fn();
const mockGetClassById = vi.fn();
const mockReverseMoveUpEntryViaRpc = vi.fn();
const mockUpdateEntry = vi.fn();

function latestReverseMoveUpMigration(): string {
  const migrationDir = resolve(__dirname, '../../../../../../supabase/migrations');
  const candidates = readdirSync(migrationDir)
    .filter(name => name.endsWith('.sql'))
    .filter(name => {
      const source = readFileSync(resolve(migrationDir, name), 'utf8');
      return source.includes('CREATE OR REPLACE FUNCTION public.reverse_move_up_entry');
    })
    .sort();
  const latest = candidates.at(-1);
  if (!latest) throw new Error('No reverse_move_up_entry migration found');
  return resolve(migrationDir, latest);
}

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  logQuery: vi.fn(),
  createDatabaseError,
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntryById: (...args: unknown[]) => mockGetEntryById(...args),
    updateEntry: (...args: unknown[]) => mockUpdateEntry(...args),
    reverseMoveUpEntryViaRpc: (...args: unknown[]) => mockReverseMoveUpEntryViaRpc(...args),
  },
  replicatedClassesTable: {
    getClassById: (...args: unknown[]) => mockGetClassById(...args),
  },
}));

/** The superseded source left behind in Interior Novice A — and the money row. */
const SOURCE: Partial<ReplicatedEntry> & { id: string } = {
  id: 'source-1',
  dogId: 'dog-1',
  classId: 'class-novice',
  class_id: 'class-novice',
  entryStatus: 'moved',
  checkInStatus: 'no-status',
  specialRequests: 'Reactive dog, needs the ramp',
  paymentStatus: 'paid',
  entryFee: 35,
};

/** The live destination in Interior Advanced A — money-neutral by construction. */
const DESTINATION: Partial<ReplicatedEntry> & { id: string } = {
  id: 'dest-1',
  dogId: 'dog-1',
  classId: 'class-advanced',
  class_id: 'class-advanced',
  entryStatus: 'confirmed',
  checkInStatus: 'checked-in',
  isScored: false,
  resultStatus: 'pending',
  movedFromEntryId: 'source-1',
  moved_from_entry_id: 'source-1',
  specialRequests: 'Moved up from class class-novice: Qualified today',
  paymentStatus: 'pending',
  entryFee: 0,
};

function entriesById(rows: Array<Partial<ReplicatedEntry> & { id: string }>) {
  return (id: string) => Promise.resolve(rows.find(row => row.id === id) ?? null);
}

describe('moveUpSupersession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntryById.mockImplementation(entriesById([SOURCE, DESTINATION]));
    mockGetClassById.mockResolvedValue({ id: 'class-novice', name: 'Interior Novice A' });
    mockReverseMoveUpEntryViaRpc.mockResolvedValue('source-1');
    mockUpdateEntry.mockResolvedValue('mutation-1');
  });

  describe('hasRunStarted over a REAL replicated row', () => {
    // The guard reads columns "by key", which only helps if the key is there.
    // `rowToEntry` is an explicit field list, and it did not name
    // `scoring_started_at` or `points_possible` — so two of the SQL guard's
    // signals were dead on the client while a comment claimed the opposite.
    // Plain-object fixtures could never see it (LESSONS `source-text-tests`).
    const SIGNAL_COLUMNS = [
      ['is_scored', true],
      ['is_in_ring', true],
      ['result_status', 'absent'],
      ['final_placement', 3],
      ['scoring_started_at', '2026-09-18T12:00:00Z'],
      ['scoring_completed_at', '2026-09-18T12:30:00Z'],
      ['ring_entry_time', '2026-09-18T12:00:00Z'],
      ['points_earned', 3],
      ['points_possible', 10],
      ['search_time_seconds', 41.2],
      ['area1_time_seconds', 12.5],
      ['area2_time_seconds', 8],
      ['area3_time_seconds', 8],
      ['area4_time_seconds', 8],
      ['total_faults', 1],
      ['total_correct_finds', 1],
      ['total_incorrect_finds', 2],
      ['no_finish_count', 1],
      ['total_score', 88],
      ['check_in_status', 'in-ring'],
    ] as const;

    it.each(SIGNAL_COLUMNS)('sees %s through the replica mapper', (column, value) => {
      const replicated = rowToEntry({
        id: 'dest-1',
        entry_status: 'confirmed',
        check_in_status: 'no-status',
        [column]: value,
      } as never);

      expect(hasRunStarted(replicated)).toBe(true);
    });

    it('is false for a freshly created destination', () => {
      expect(
        hasRunStarted(
          rowToEntry({
            id: 'dest-1',
            entry_status: 'confirmed',
            check_in_status: 'checked-in',
          } as never)
        )
      ).toBe(false);
    });

    it('names every column the SQL guard names, and no fewer', () => {
      // The two lists stand in for each other, so they are compared rather than
      // described. Anything the SQL refuses to undo, the dialog must be able to
      // explain BEFORE the secretary presses the button.
      const migration = readFileSync(latestReverseMoveUpMigration(), 'utf8');
      const reverseBody = migration.slice(
        migration.indexOf('CREATE OR REPLACE FUNCTION public.reverse_move_up_entry'),
        migration.indexOf('REVOKE ALL ON FUNCTION public.reverse_move_up_entry')
      );
      const guard = reverseBody.slice(
        reverseBody.indexOf('IF COALESCE(v_dest.is_scored'),
        reverseBody.indexOf('RAISE EXCEPTION', reverseBody.indexOf('IF COALESCE(v_dest.is_scored'))
      );
      const sqlColumns = new Set(
        [...guard.matchAll(/v_dest\.([a-z0-9_]+)/g)].map(match => match[1] as string)
      );
      const clientColumns = new Set(SIGNAL_COLUMNS.map(([column]) => column as string));

      expect([...sqlColumns].sort()).toEqual([...clientColumns].sort());
    });

    it('has a durable guard against reversing an intermediate move-up', () => {
      const migration = readFileSync(latestReverseMoveUpMigration(), 'utf8');

      expect(migration).toMatch(
        /IF COALESCE\(v_dest\.entry_status, ''\) = 'moved' THEN[\s\S]*?cannot be reversed/
      );
    });
  });

  describe('hasRunStarted', () => {
    it('is false for an untouched destination', () => {
      expect(hasRunStarted(DESTINATION)).toBe(false);
    });

    it.each([
      ['a recorded score', { isScored: true }],
      ['a non-pending result', { resultStatus: 'absent' }],
      ['a placement', { finalPlacement: '1' }],
      ['the dog in the ring', { isInRing: true }],
      ['a ring entry time', { ring_entry_time: '2026-09-18T12:00:00Z' }],
      ['scoring already open', { scoringCompletedAt: '2026-09-18T12:05:00Z' }],
      ['points recorded', { points_earned: 3 }],
      ['a search time', { searchTimeSeconds: 41.2 }],
      ['an area-1 time', { area1_time_seconds: 12.5 }],
      ['an area-3 time', { area3_time_seconds: 8 }],
      ['check-in showing in-ring', { checkInStatus: 'in-ring' as const }],
      // Round 3: the client list was three signals behind the SQL it claims to
      // mirror, and `points_possible` / `scoring_started_at` are real `entries`
      // columns the replica's mapper does not even name.
      ['incorrect finds recorded', { total_incorrect_finds: 2 }],
      ['a no-finish recorded', { no_finish_count: 1 }],
      ['points possible set', { points_possible: 10 }],
      ['faults recorded', { total_faults: 3 }],
      ['correct finds recorded', { total_correct_finds: 1 }],
      ['a total score', { total_score: 88 }],
      ['scoring already open', { scoring_started_at: '2026-09-18T12:00:00Z' }],
    ])('is true for %s', (_label: string, patch: Record<string, unknown>) => {
      // The point of the broadened guard: a dog mid-run has is_scored === false
      // and result_status === 'pending', so a result-only test would offer Move
      // back and soft-delete the row the judge is scoring into.
      expect(hasRunStarted({ ...DESTINATION, ...patch })).toBe(true);
    });
  });

  describe('resolveMoveUpReversal', () => {
    it('follows moved_from_entry_id to the superseded source', async () => {
      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'available',
        destinationEntryId: 'dest-1',
        sourceEntryId: 'source-1',
        sourceClassId: 'class-novice',
        sourceClassName: 'Interior Novice A',
      });
    });

    it('reports an ordinary entry as not a move-up', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([{ id: 'plain-1', dogId: 'dog-1', entryStatus: 'confirmed' }])
      );

      await expect(resolveMoveUpReversal('plain-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'not-a-move-up',
      });
    });

    it('refuses a legacy pair that has only the note and no FK', async () => {
      // Recognised (so the dialog can explain), never offered: the server
      // reverse follows the FK, so it would refuse this pair anyway. There are
      // zero `entry_status = 'moved'` rows on the live database, so this is
      // demo/staging data only.
      mockGetEntryById.mockImplementation(
        entriesById([
          SOURCE,
          { ...DESTINATION, movedFromEntryId: undefined, moved_from_entry_id: undefined },
        ])
      );

      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'source-missing',
      });
    });

    it('refuses once the run has started, before asking anything else', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([SOURCE, { ...DESTINATION, area1_time_seconds: 12.5 }])
      );

      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'run-started',
      });
    });

    it('refuses an intermediate destination that has already been superseded', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([SOURCE, { ...DESTINATION, entryStatus: 'moved' }])
      );

      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'superseded',
      });
    });

    it('refuses when the source is no longer the superseded entry', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([{ ...SOURCE, entryStatus: 'withdrawn' }, DESTINATION])
      );

      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'source-missing',
      });
    });

    it('refuses when the source has been soft-deleted', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([{ ...SOURCE, deletedAt: '2026-09-18T12:00:00Z' }, DESTINATION])
      );

      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'source-missing',
      });
    });
  });

  describe('reverseShowMapMoveUp', () => {
    it('is ONE server call and writes no entry rows directly', async () => {
      const result = await reverseShowMapMoveUp('dest-1');

      expect(result).toEqual({
        destinationEntryId: 'dest-1',
        sourceEntryId: 'source-1',
        sourceClassId: 'class-novice',
        sourceClassName: 'Interior Novice A',
      });

      expect(mockReverseMoveUpEntryViaRpc).toHaveBeenCalledTimes(1);
      expect(mockReverseMoveUpEntryViaRpc).toHaveBeenCalledWith('dest-1');
      // The restore and the soft-delete are one transaction inside the function,
      // so the two-write sequence that could strand the dog with no live entry
      // is gone.
      expect(mockUpdateEntry).not.toHaveBeenCalled();
    });

    it('touches no money, because the destination never held any (MYK9-639)', async () => {
      // The money stayed on the source throughout, so restoring it needs no
      // payment write at all — and cannot lose a refund or comp recorded since
      // the move, which is what the copy-forward shape would have dropped.
      await reverseShowMapMoveUp('dest-1');

      const [rpcArg] = mockReverseMoveUpEntryViaRpc.mock.calls[0] as [unknown];
      expect(rpcArg).toBe('dest-1');
      expect(mockUpdateEntry).not.toHaveBeenCalled();
    });

    it('refuses without calling the server when the run has started', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([SOURCE, { ...DESTINATION, isScored: true }])
      );

      await expect(reverseShowMapMoveUp('dest-1')).rejects.toThrow(/already started/);
      expect(mockReverseMoveUpEntryViaRpc).not.toHaveBeenCalled();
    });

    it('refuses without calling the server when the source is gone', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([{ ...SOURCE, entryStatus: 'confirmed' }, DESTINATION])
      );

      await expect(reverseShowMapMoveUp('dest-1')).rejects.toThrow(/no longer has the original/);
      expect(mockReverseMoveUpEntryViaRpc).not.toHaveBeenCalled();
    });

    it('surfaces a server refusal rather than reporting success', async () => {
      mockReverseMoveUpEntryViaRpc.mockRejectedValue(
        new Error('This run has already started, so the move-up can no longer be reversed.')
      );

      await expect(reverseShowMapMoveUp('dest-1')).rejects.toThrow(/already started/);
    });
  });
});
