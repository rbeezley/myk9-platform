/**
 * MYK9-879 (Codex P1): a Finish Payment line settles an entry whose fee was
 * FROZEN at creation, so the cart quotes that stored `entry_fee`, never a price
 * recomputed from the show's current tiers. A junior entry frozen at 15.00 comes
 * back at 15.00 even after the junior tier is raised, and an entry frozen at the
 * normal fee stays normal after a tier appears. The server charges the same
 * amount, so there is no heal-and-409 round trip.
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
    ...overrides,
  };
}

describe('getAuthoritativeEntryFeeCents quotes the frozen entry fee', () => {
  it('an entry frozen at 15.00 stays 1500 whatever the show charges now', () => {
    expect(getAuthoritativeEntryFeeCents(row())).toBe(1500);
    expect(getAuthoritativeEntryFeeCents(row({ entry_fee: '15.00' }))).toBe(1500);
    expect(getAuthoritativeEntryFeeCents(row({ show_pre_entry_fee: 99 }))).toBe(1500);
  });

  it('an entry frozen at the normal fee stays normal', () => {
    expect(getAuthoritativeEntryFeeCents(row({ entry_fee: 30 }))).toBe(3000);
  });

  it('falls back to the tiers only for a row with no positive stored fee', () => {
    for (const entry_fee of [null, 0, '0.00']) {
      expect(getAuthoritativeEntryFeeCents(row({ entry_fee }))).toBe(3000);
    }
  });
});

describe('findRecoverableEntries carries the stored fee to the quote', () => {
  beforeEach(() => {
    tables.selectedEntryColumns = '';
  });

  it('reads entry_fee and quotes it', async () => {
    tables.entries = [
      {
        id: 'entry-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        handler_id: null,
        entry_fee: 15,
        jump_height: null,
        special_requests: null,
        class: { entry_fee: 28 },
        show: { pre_entry_fee: 30, day_of_show_fee: 45, start_date: '2099-05-01' },
      },
    ];
    const rows = await findRecoverableEntries({
      showId: 'show-1',
      exhibitorId: 'exhibitor-1',
      entryIds: ['entry-1'],
    });
    expect(tables.selectedEntryColumns).toContain('entry_fee');
    expect(rows).toHaveLength(1);
    expect(getAuthoritativeEntryFeeCents(rows[0])).toBe(1500);
  });
});
