/**
 * MYK9-879: a Finish Payment line settles an entry whose fee was fixed at
 * creation. An entry that recorded the exhibitor's junior declaration must come
 * back into the cart at the junior fee (capped), not at the normal fee that would
 * make checkout heal and refuse it. Nothing is re-derived and no date of birth is
 * read: only the stored record counts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tables = vi.hoisted(() => ({
  entries: [] as unknown[],
  selectedEntryColumns: '' as string,
}));

vi.mock('@/lib/supabase', () => {
  const make = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['eq', 'or', 'in', 'is']) builder[method] = () => builder;
    builder.select = (columns: string) => {
      if (table === 'entries') tables.selectedEntryColumns = columns;
      return builder;
    };
    builder.maybeSingle = () => Promise.resolve({ data: { person_id: 'person-1' }, error: null });
    builder.then = (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) =>
      Promise.resolve({
        data: table === 'dogs' ? [{ id: 'dog-1' }] : tables.entries,
        error: null,
      }).then(resolve, reject);
    return builder;
  };
  return { supabase: { from: make } };
});
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  findRecoverableEntries,
  getAuthoritativeEntryFeeCents,
  type RecoverableEntryRow,
} from './cartStore.recovery';

function row(overrides: Partial<RecoverableEntryRow> = {}): RecoverableEntryRow {
  return {
    id: 'entry-1',
    class_id: 'class-1',
    dog_id: 'dog-1',
    handler_id: null,
    entry_fee: 15,
    jump_height: null,
    special_requests: null,
    class_entry_fee: 28,
    show_pre_entry_fee: 30,
    show_day_of_show_fee: 45,
    show_start_date: '2099-05-01',
    show_junior_handler_fee: 15,
    junior_fee_declared: false,
    ...overrides,
  };
}

describe('getAuthoritativeEntryFeeCents with a stored junior declaration', () => {
  it('keeps an entry that recorded the declaration at the junior fee', () => {
    expect(getAuthoritativeEntryFeeCents(row({ junior_fee_declared: true }))).toBe(1500);
  });

  it('prices an entry with no declaration at the normal fee', () => {
    expect(getAuthoritativeEntryFeeCents(row())).toBe(3000);
    expect(getAuthoritativeEntryFeeCents(row({ junior_fee_declared: null }))).toBe(3000);
  });

  it('is capped at the normal fee when the junior tier is above it', () => {
    expect(
      getAuthoritativeEntryFeeCents(row({ junior_fee_declared: true, show_junior_handler_fee: 40 }))
    ).toBe(3000);
  });

  it('charges the normal fee when the show has no junior tier now', () => {
    for (const show_junior_handler_fee of [null, 0, undefined]) {
      expect(
        getAuthoritativeEntryFeeCents(row({ junior_fee_declared: true, show_junior_handler_fee }))
      ).toBe(3000);
    }
  });
});

describe('findRecoverableEntries carries the stored declaration to the fee', () => {
  beforeEach(() => {
    tables.selectedEntryColumns = '';
  });

  it('asks for the declaration and the show junior fee, and maps them onto the row', async () => {
    tables.entries = [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        handler_id: null,
        entry_fee: 15,
        junior_fee_declared: true,
        jump_height: null,
        special_requests: null,
        class: { entry_fee: 28 },
        show: {
          pre_entry_fee: 30,
          day_of_show_fee: 45,
          junior_handler_fee: 15,
          start_date: '2099-05-01',
        },
      },
    ];
    const rows = await findRecoverableEntries({
      showId: 'show-1',
      exhibitorId: 'exhibitor-1',
      entryIds: ['entry-1'],
    });
    expect(tables.selectedEntryColumns).toContain('junior_fee_declared');
    expect(tables.selectedEntryColumns).toContain('junior_handler_fee');
    expect(rows).toHaveLength(1);
    expect(getAuthoritativeEntryFeeCents(rows[0])).toBe(1500);
  });
});
