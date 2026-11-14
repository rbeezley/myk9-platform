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
    expect(
      showCloseRecordColumns({
        closedOpenLines: [{ key: 'unreleased', count: 3 }],
        closedAt: '2026-11-14T20:00:00Z',
      })
    ).toEqual({
      closed_open_lines: [{ key: 'unreleased', count: 3 }],
      closed_at: '2026-11-14T20:00:00Z',
    });
    expect(
      showCloseRecordColumns({ closedOpenLines: null, closedAt: null, reopenReason: 'Missing' })
    ).toEqual({ closed_open_lines: null, closed_at: null, reopen_reason: 'Missing' });
  });

  it('reads the four columns back, treating a missing column as null', () => {
    expect(showCloseRecordFromRow({})).toEqual({
      closedOpenLines: null,
      closedAt: null,
      reopenedAt: null,
      reopenReason: null,
    });
    expect(
      showCloseRecordFromRow({
        closed_open_lines: [{ key: 'unreleased', count: 3 }],
        closed_at: 'a',
        reopened_at: 'b',
        reopen_reason: 'c',
      })
    ).toEqual({
      closedOpenLines: [{ key: 'unreleased', count: 3 }],
      closedAt: 'a',
      reopenedAt: 'b',
      reopenReason: 'c',
    });
  });

  it('drops the columns an update did not include so a stale replica cannot clobber them', () => {
    const payload: Record<string, unknown> = {
      name: 'x',
      closed_open_lines: [],
      closed_at: 'a',
      reopened_at: 'b',
      reopen_reason: 'c',
    };
    stripUnsetCloseRecordColumns(payload, { reopenReason: 'c' });
    expect(payload).toEqual({ name: 'x', reopen_reason: 'c' });
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
