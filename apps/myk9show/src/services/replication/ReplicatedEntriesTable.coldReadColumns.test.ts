/**
 * MYK9-1362: the cold single-row reads of `view_authenticated_entry_results`
 * select an explicit column list instead of `*`. A column the mapper reads but
 * the list omits would silently arrive undefined on a hydrated row (the
 * last-hop drop), so the list is proven against the mapper itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable } from './ReplicatedEntriesTable';
import { rowToEntry, type EntryRow } from './ReplicatedEntriesTable.mapper';
import {
  COLD_ELIGIBILITY_ROW_SELECT,
  COLD_ENTRY_ROW_SELECT,
  ENTRY_MAPPER_COLUMNS_NOT_ON_VIEW,
  ENTRY_VIEW_MAPPER_COLUMNS,
} from './ReplicatedEntriesTable.coldReadColumns';

const supabaseMocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: supabaseMocks.rpc, from: supabaseMocks.from },
}));

/** Every key the mapper touches, recorded by a Proxy, whatever the access style. */
function columnsReadByMapper(): Set<string> {
  const read = new Set<string>();
  const row = new Proxy({} as Record<string, unknown>, {
    get(_target, key) {
      if (typeof key === 'string') read.add(key);
      return undefined;
    },
  });
  rowToEntry(row as unknown as EntryRow);
  return read;
}

/**
 * A row carrying a distinct, truthy value in every column the MAPPER reads off
 * the view. Built from the mapper's own reads, not from the list under test, so
 * a column the list forgot is still present here.
 */
function fullViewRow(): Record<string, unknown> {
  const notOnView = new Set<string>(ENTRY_MAPPER_COLUMNS_NOT_ON_VIEW);
  const row: Record<string, unknown> = {};
  [...columnsReadByMapper()]
    .filter(column => !notOnView.has(column))
    .forEach((column, i) => {
      row[column] = `value-${i}`;
    });
  // The typed columns the mapper type-checks at runtime.
  Object.assign(row, {
    id: 'entry-1',
    results_private: true,
    awaiting_registration_number: true,
    placement_tiebreak: 3,
    is_scored: true,
    is_in_ring: true,
    comped: true,
    move_up_requested: true,
    is_day_of_show: true,
    total_faults: 2,
    total_score: 90,
    final_placement: 1,
    search_time_seconds: 65,
    version: 9,
  });
  return row;
}

describe('cold-read column list vs the entry mapper', () => {
  it('covers every column the mapper reads, except those the view does not carry', () => {
    const read = columnsReadByMapper();
    const covered = new Set<string>([
      ...ENTRY_VIEW_MAPPER_COLUMNS,
      ...ENTRY_MAPPER_COLUMNS_NOT_ON_VIEW,
    ]);
    expect([...read].filter(column => !covered.has(column))).toEqual([]);
    expect([...covered].filter(column => !read.has(column))).toEqual([]);
  });

  it('maps a row built from ONLY the listed columns exactly as it maps the full row', () => {
    const full = fullViewRow();
    const projected = Object.fromEntries(
      COLD_ENTRY_ROW_SELECT.split(',').map(column => [column, full[column]])
    );
    expect(rowToEntry(projected as unknown as EntryRow)).toEqual(
      rowToEntry(full as unknown as EntryRow)
    );
  });

  it('selects version beside the mapper columns, once each', () => {
    const columns = COLD_ENTRY_ROW_SELECT.split(',');
    expect(columns).toContain('version');
    expect(new Set(columns).size).toBe(columns.length);
  });
});

describe('cold single-row reads select explicit columns', () => {
  let table: ReplicatedEntriesTable;
  let select: ReturnType<typeof vi.fn>;

  function mockView(result: { data: unknown; error: unknown }) {
    const node: Record<string, unknown> = {};
    select = vi.fn(() => node);
    node.select = select;
    node.eq = vi.fn(() => node);
    node.in = vi.fn(() => Promise.resolve(result));
    node.maybeSingle = vi.fn(() => Promise.resolve(result));
    supabaseMocks.from.mockReturnValue(node);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    table = new ReplicatedEntriesTable();
    const internals = table as unknown as Record<string, unknown>;
    internals.get = vi.fn().mockResolvedValue(undefined);
    internals.set = vi.fn().mockResolvedValue({ ok: true });
  });

  it('write-path hydration reads the whole-entry list', async () => {
    mockView({ data: fullViewRow(), error: null });
    await (
      table as unknown as { getOrHydrateEntryForWrite(id: string): Promise<unknown> }
    ).getOrHydrateEntryForWrite('entry-1');
    expect(supabaseMocks.from).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(select).toHaveBeenCalledWith(COLD_ENTRY_ROW_SELECT);
  });

  it('the withdraw read reads the whole-entry list and keeps the cold version', async () => {
    mockView({ data: fullViewRow(), error: null });
    const result = await (
      table as unknown as {
        readEntryForWithdrawal(id: string): Promise<{ coldVersion: number | null }>;
      }
    ).readEntryForWithdrawal('entry-1');
    expect(select).toHaveBeenCalledWith(COLD_ENTRY_ROW_SELECT);
    expect(result.coldVersion).toBe(9);
  });

  it('the post-withdrawal read-back reads the whole-entry list', async () => {
    mockView({ data: fullViewRow(), error: null });
    (table as unknown as { get: unknown }).get = vi.fn().mockResolvedValue({ id: 'entry-1' });
    await (
      table as unknown as {
        hydrateConfirmedRow(id: string, wasCached: boolean, v: number): Promise<void>;
      }
    ).hydrateConfirmedRow('entry-1', true, 10);
    expect(select).toHaveBeenCalledWith(COLD_ENTRY_ROW_SELECT);
  });

  it('batched eligibility reads only the columns the verdict consumes', async () => {
    mockView({
      data: [
        {
          id: 'entry-1',
          entry_status: 'confirmed',
          payment_status: 'pending',
          check_in_status: 'no-status',
          is_in_ring: false,
          is_scored: false,
          deleted_at: null,
        },
      ],
      error: null,
    });
    const result = await table.getRemoveFromClassEligibilityForEntries(['entry-1']);
    expect(select).toHaveBeenCalledWith(COLD_ELIGIBILITY_ROW_SELECT);
    expect(COLD_ELIGIBILITY_ROW_SELECT).toBe(
      'id,entry_status,payment_status,check_in_status,is_in_ring,is_scored,deleted_at'
    );
    expect(result['entry-1'].withdraw.allowed).toBe(true);
  });
});
