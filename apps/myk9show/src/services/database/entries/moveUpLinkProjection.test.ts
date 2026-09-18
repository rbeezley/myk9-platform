/**
 * MYK9-639: `moved_from_entry_id` must survive BOTH reads into
 * `EntryManagementEntry`.
 *
 * The aggregations were already correct and their tests already passed, because
 * every one of them hand-built a fixture that carried `movedFromEntryId`. The
 * link never actually arrived: the warm path is a 58-key hand-written row build
 * that did not name the column, the cold path is an explicit PostgREST select
 * list that did not either, and `SecretaryEntry` had no such field — so the
 * mapper reached for it through an `as unknown as Record<string, unknown>` cast
 * and got `undefined` on every row, forever. A moved-up dog's $35 then read as
 * $0, silently, because a MISSING link resolves an entry to itself with no
 * `problem` to surface.
 *
 * So this test runs the REAL projections. LESSONS `last-hop-drop`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  createDatabaseError,
  logQuery: vi.fn(),
  supabase: { from: mocks.from },
}));

import { toSecretaryEntry } from './secretaryReadReplication';
import { postgrestGetSecretaryEntriesForShow } from './secretaryPostgrest';
import { AUTHENTICATED_ENTRY_READ_COLUMNS } from './entrySelects';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';

const EMPTY_RELATIONS = {
  dogsMap: new Map(),
  classesMap: new Map(),
  armbandsByEntryId: new Map(),
  armbandsByDogId: new Map(),
  peopleMap: new Map(),
  enrollmentsMap: new Map(),
  trialsMap: new Map(),
  pullMetadataMap: new Map(),
} as unknown as Parameters<typeof toSecretaryEntry>[1];

describe('moved_from_entry_id reaches Entry Management (MYK9-639)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('survives the WARM projection, from the replica row to EntryManagementEntry', () => {
    const secretaryRow = toSecretaryEntry(
      {
        id: 'dest-1',
        dogId: 'dog-1',
        classId: 'class-advanced',
        showId: 'show-1',
        entryStatus: 'confirmed',
        entryFee: 0,
        paymentStatus: 'pending',
        movedFromEntryId: 'source-1',
        moved_from_entry_id: 'source-1',
      } as never,
      EMPTY_RELATIONS
    );

    expect(secretaryRow.moved_from_entry_id).toBe('source-1');

    const managed = mapSecretaryEntryToEntryManagementEntry(secretaryRow, null);
    expect(managed.movedFromEntryId).toBe('source-1');
  });

  it('reads as null on the warm path for an entry that was never moved', () => {
    const secretaryRow = toSecretaryEntry(
      { id: 'plain-1', dogId: 'dog-1', classId: 'class-1', entryStatus: 'confirmed' } as never,
      EMPTY_RELATIONS
    );

    expect(secretaryRow.moved_from_entry_id).toBeNull();
    expect(mapSecretaryEntryToEntryManagementEntry(secretaryRow, null).movedFromEntryId).toBeNull();
  });

  it('is REQUESTED by the cold PostgREST read, and survives it', async () => {
    const selects: string[] = [];
    mocks.from.mockImplementation(() => {
      const query = {
        select: vi.fn((columns: string) => {
          selects.push(columns);
          return query;
        }),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        is: vi.fn(() => query),
        not: vi.fn(() => query),
        or: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        then: (resolve: (value: { data: unknown[] | null; error: unknown }) => unknown) =>
          Promise.resolve(
            resolve({
              data: [
                {
                  id: 'dest-1',
                  dog_id: 'dog-1',
                  class_id: 'class-advanced',
                  show_id: 'show-1',
                  entry_status: 'confirmed',
                  entry_fee: 0,
                  payment_status: 'pending',
                  moved_from_entry_id: 'source-1',
                },
              ],
              error: null,
            })
          ),
      };
      return query;
    });

    const { data: rows } = await postgrestGetSecretaryEntriesForShow(
      'show-1',
      Date.now(),
      'select_secretary_entries'
    );

    // The column has to be NAMED: PostgREST returns exactly what the select
    // asks for, so an omission here is silent and total. (This read goes
    // through `view_authenticated_entry_results`, which migration
    // 20260918193300 appends the column to.)
    expect(selects.some(columns => columns.includes('moved_from_entry_id'))).toBe(true);
    expect(rows[0]?.moved_from_entry_id).toBe('source-1');
    expect(mapSecretaryEntryToEntryManagementEntry(rows[0]!, null).movedFromEntryId).toBe(
      'source-1'
    );
  });

  it('is named by the shared authenticated entry select, which feeds the financial reads', () => {
    // `AUTHENTICATED_ENTRY_READ_COLUMNS` is the PostgREST fallback under the
    // Show Financial Summary and the trial-scoped Financial Report. Warm reads
    // go through the replication view, which already carries the column, so
    // without this the same page reports different money warm vs cold.
    expect(AUTHENTICATED_ENTRY_READ_COLUMNS).toContain('moved_from_entry_id');
  });
});
