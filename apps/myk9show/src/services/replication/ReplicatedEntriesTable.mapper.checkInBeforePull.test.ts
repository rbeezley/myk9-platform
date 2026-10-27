/**
 * MYK9-1396: the stored pre-Pull check-in through the real mapper and the real
 * in-flight conflict check. The local mirror holds an explicit `null` after an
 * Accept; the server's row for the same outcome must map to the same value, or a
 * sync before the upload is acknowledged reports a conflict nobody caused.
 */
import { describe, expect, it } from 'vitest';
import { detectDirtyRowConflict } from '@myk9/replication';

import { rowToEntry, type EntryRow, type ReplicatedEntry } from './ReplicatedEntriesTable.mapper';
import { ENTRY_DIRTY_ROW_COMPARE_POLICY } from './entriesDirtyRowComparePolicy';
import { mirrorCheckInBeforePull } from './entryCheckInBeforePull';

const row = (extra: Record<string, unknown>) =>
  ({ id: 'entry-1', ...extra }) as unknown as EntryRow;

const conflictFields = (base: ReplicatedEntry, local: ReplicatedEntry, remote: ReplicatedEntry) =>
  detectDirtyRowConflict({
    base,
    local,
    remote,
    comparePolicy: ENTRY_DIRTY_ROW_COMPARE_POLICY,
  }).fields;

describe('check_in_status_before_pull through the mapper', () => {
  it('keeps an explicit NULL as null and an absent column as undefined', () => {
    const withNull = rowToEntry(row({ check_in_status_before_pull: null }));
    expect(withNull.checkInStatusBeforePull).toBeNull();
    expect(withNull.check_in_status_before_pull).toBeNull();
    expect(rowToEntry(row({})).checkInStatusBeforePull).toBeUndefined();
    expect(
      rowToEntry(row({ check_in_status_before_pull: 'checked-in' })).checkInStatusBeforePull
    ).toBe('checked-in');
  });
});

describe('in-flight reconciliation of an Accept after a Pull (MYK9-1396)', () => {
  const base = rowToEntry(
    row({ check_in_status: 'pulled', check_in_status_before_pull: 'checked-in' })
  );
  const local = mirrorCheckInBeforePull(base, {
    ...base,
    checkInStatus: 'checked-in',
    check_in_status: 'checked-in',
  });

  it('the mirror holds null after the Accept', () => {
    expect(local.checkInStatusBeforePull).toBeNull();
  });

  it('reports no conflict when the server row cleared the column to NULL', () => {
    const remote = rowToEntry(
      row({ check_in_status: 'checked-in', check_in_status_before_pull: null })
    );
    expect(conflictFields(base, local, remote)).toEqual([]);
  });

  it('reports no conflict when the server row lacks the column (pre-migration)', () => {
    const oldBase = rowToEntry(row({ check_in_status: 'pulled' }));
    const oldLocal = mirrorCheckInBeforePull(oldBase, {
      ...oldBase,
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
    });
    const remote = rowToEntry(row({ check_in_status: 'checked-in' }));
    expect(conflictFields(oldBase, oldLocal, remote)).toEqual([]);
  });

  it('reports no conflict when the server stamped NULL where the mapper defaults to no-status', () => {
    // A row whose check_in_status was NULL is mapped to 'no-status'; the trigger
    // stamps NULL on its Pull, the local mirror stamps 'no-status'. Same outcome.
    const nullBase = rowToEntry(row({ check_in_status: null, check_in_status_before_pull: null }));
    const pulledLocal = mirrorCheckInBeforePull(nullBase, {
      ...nullBase,
      checkInStatus: 'pulled',
      check_in_status: 'pulled',
    });
    const remote = rowToEntry(
      row({ check_in_status: 'pulled', check_in_status_before_pull: null })
    );
    expect(conflictFields(nullBase, pulledLocal, remote)).toEqual([]);
  });

  it('reads no-status, NULL and an absent column as the same "nothing remembered"', () => {
    const base = rowToEntry(row({ check_in_status_before_pull: 'checked-in' }));
    const local = { ...base, checkInStatusBeforePull: 'no-status' as const };
    const remote = rowToEntry(row({ check_in_status_before_pull: null }));
    expect(conflictFields(base, local, remote)).toEqual([]);
  });

  it('still reports a genuinely different stored value', () => {
    const pulledBase = rowToEntry(row({ check_in_status: 'checked-in' }));
    const pulledLocal = mirrorCheckInBeforePull(pulledBase, {
      ...pulledBase,
      checkInStatus: 'pulled',
      check_in_status: 'pulled',
    });
    expect(pulledLocal.checkInStatusBeforePull).toBe('checked-in');
    const remote = rowToEntry(
      row({ check_in_status: 'pulled', check_in_status_before_pull: 'at-gate' })
    );
    expect(conflictFields(pulledBase, pulledLocal, remote)).toEqual(
      expect.arrayContaining(['check_in_status_before_pull'])
    );
  });
});
