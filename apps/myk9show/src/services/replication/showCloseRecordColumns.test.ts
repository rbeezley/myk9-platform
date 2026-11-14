import { describe, expect, it } from 'vitest';
import { rowToShow } from './showRowMapping';
import {
  showCloseRecordColumns,
  showCloseRecordFromRow,
  stripUnsetCloseRecordColumns,
} from './showCloseRecordColumns';
import { rowToTrial } from './ReplicatedTrialsTable';

describe('show close record columns (MYK9-1945)', () => {
  it('writes only the fields that are defined, and null clears', () => {
    expect(showCloseRecordColumns({})).toEqual({});
    expect(showCloseRecordColumns({ closedAt: '2026-11-14T20:00:00Z' })).toEqual({
      closed_at: '2026-11-14T20:00:00Z',
    });
    expect(showCloseRecordColumns({ closedAt: null, reopenedAt: null })).toEqual({
      closed_at: null,
      reopened_at: null,
    });
  });

  it('never selects or writes the staff-only note columns moved to show_close_notes', () => {
    const written = showCloseRecordColumns({
      closedOpenLines: [{ key: 'unreleased', count: 3 }],
      reopenReason: 'Missing',
    } as unknown as Parameters<typeof showCloseRecordColumns>[0]);
    expect(written).toEqual({});
    expect(showCloseRecordFromRow({ closed_open_lines: [], reopen_reason: 'c' })).toEqual({
      closedAt: null,
      reopenedAt: null,
    });
  });

  it('reads the two columns back, treating a missing column as null', () => {
    expect(showCloseRecordFromRow({})).toEqual({ closedAt: null, reopenedAt: null });
    expect(showCloseRecordFromRow({ closed_at: 'a', reopened_at: 'b' })).toEqual({
      closedAt: 'a',
      reopenedAt: 'b',
    });
  });

  it('drops the columns an update did not include so a stale replica cannot clobber them', () => {
    const payload: Record<string, unknown> = { name: 'x', closed_at: 'a', reopened_at: 'b' };
    stripUnsetCloseRecordColumns(payload, { reopenedAt: 'b' });
    expect(payload).toEqual({ name: 'x', reopened_at: 'b' });
  });

  it('rowToShow carries the close record into the replica', () => {
    const show = rowToShow({
      id: 's1',
      name: 'n',
      organization: 'AKC',
      start_date: '2026-11-14',
      end_date: '2026-11-14',
      closed_at: '2026-11-14T20:00:00Z',
    } as unknown as Parameters<typeof rowToShow>[0]);
    expect(show.closedAt).toBe('2026-11-14T20:00:00Z');
    expect(show.reopenedAt).toBeNull();
  });

  it('rowToTrial reads status_before_close only when the column exists', () => {
    const base = { id: 't1', name: 'n', date: '2026-11-14', show_id: 's1' };
    expect(rowToTrial(base as unknown as Parameters<typeof rowToTrial>[0]).statusBeforeClose).toBe(
      undefined
    );
    expect(
      rowToTrial({ ...base, status_before_close: 'in_progress' } as unknown as Parameters<
        typeof rowToTrial
      >[0]).statusBeforeClose
    ).toBe('in_progress');
  });
});
