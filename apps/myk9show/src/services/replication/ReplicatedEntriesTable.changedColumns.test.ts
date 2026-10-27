import { describe, expect, it } from 'vitest';
import { entryChangedColumnsRow } from './ReplicatedEntriesTable.changedColumns';
import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';
import { buildRingsideRpcFields } from './ringsideEntryRpc';

// MYK9-1442 (Codex P2 on #3318): a placement-only clear must keep final_placement
// in the narrowed payload even when its serialized value does not change, or the
// ringside RPC route is lost and a steward's write falls back to a direct UPDATE.
describe('entryChangedColumnsRow placement clears', () => {
  const clear = (before: ReplicatedEntry) => {
    const updates: Partial<ReplicatedEntry> = { finalPlacement: null };
    const row = entryChangedColumnsRow(before, updates, { ...before, ...updates });
    return { row, rpc: buildRingsideRpcFields(Object.keys(updates), row) };
  };

  it('keeps final_placement when clearing an entry that has no placement', () => {
    const { row, rpc } = clear({ id: 'e1', resultStatus: 'qualified' } as ReplicatedEntry);

    expect(row).toHaveProperty('final_placement', null);
    expect(rpc).toEqual({ final_placement: null });
  });

  it('keeps final_placement when the result is not qualified (always serialized null)', () => {
    const { row, rpc } = clear({
      id: 'e1',
      resultStatus: 'nq',
      finalPlacement: '2',
    } as ReplicatedEntry);

    expect(row).toHaveProperty('final_placement', null);
    expect(rpc).toEqual({ final_placement: null });
  });

  it('still leaves unrelated columns out', () => {
    const { row } = clear({
      id: 'e1',
      resultStatus: 'qualified',
      checkInStatus: 'checked-in',
    } as ReplicatedEntry);

    expect(row).not.toHaveProperty('check_in_status');
  });
});
