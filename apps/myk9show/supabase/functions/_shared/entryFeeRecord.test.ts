// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  planEntryFeeRecord,
  recordChargedEntryFee,
  storedFeeToCents,
  type EntryFeeRecordClient,
} from './entryFeeRecord';
import { priceCartItems, type StoredEntryJunior } from './cartItemPricing';

// Codex round 2, P1: the ONE rule for writing entries.entry_fee on an existing
// entry. Write only when the stored fee is NULL or 0, recording what was charged;
// never overwrite a positive fee.

type Row = { id: string; entry_fee: number | string | null };

/** A tiny in-memory entries table that honors the one filter the module sends. */
function fakeClient(rows: Row[]) {
  const writes: { id: string; values: unknown; filter: string }[] = [];
  const client: EntryFeeRecordClient = {
    from() {
      return {
        update(values) {
          return {
            eq(_column, id) {
              return {
                or(filter) {
                  return {
                    select() {
                      writes.push({ id, values, filter });
                      const row = rows.find(r => r.id === id);
                      const matches =
                        filter === 'entry_fee.is.null,entry_fee.eq.0' &&
                        row !== undefined &&
                        (row.entry_fee === null || Number(row.entry_fee) === 0);
                      if (row && matches) row.entry_fee = values.entry_fee;
                      return Promise.resolve({ data: matches ? [{ id }] : [], error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, writes };
}

describe('planEntryFeeRecord', () => {
  it('records the charge when the stored fee is NULL or 0', () => {
    for (const stored of [null, undefined, 0, '0', '0.00']) {
      expect(planEntryFeeRecord(stored, 3000)).toBe(30);
    }
  });

  it('never overwrites a positive stored fee', () => {
    expect(planEntryFeeRecord(15, 3000)).toBeNull();
    expect(planEntryFeeRecord('15.00', 2000)).toBeNull();
  });

  it('writes nothing for a charge that is not positive', () => {
    for (const cents of [0, -1, Number.NaN]) expect(planEntryFeeRecord(null, cents)).toBeNull();
  });
});

describe('recovery of an existing entry records what was charged', () => {
  const show = {
    pre_entry_fee: 30,
    day_of_show_fee: 45,
    start_date: '2099-05-01',
    junior_handler_fee: 15,
  };
  const NOW = '2026-10-01T12:00:00Z';
  const line = {
    id: 'item-1',
    dog_id: 'dog-1',
    class_id: 'class-1',
    entry_id: 'entry-1',
    junior_fee_declared: false,
    class_entry_fee: 28,
  };
  const stored = (fee: number | string | null) =>
    new Map<string, StoredEntryJunior>([
      [
        'entry-1',
        {
          dog_id: 'dog-1',
          class_id: 'class-1',
          entry_fee: fee,
          junior_fee_declared: false,
          junior_fee_override_by: null,
        },
      ],
    ]);

  // What the webhook does for a Finish Payment line: price it, charge it, then
  // record the charge through the shared rule.
  async function recover(fee: number | string | null) {
    const rows: Row[] = [{ id: 'entry-1', entry_fee: fee }];
    const { client, writes } = fakeClient(rows);
    const charged = priceCartItems(show, [line], stored(fee), NOW).get('item-1') ?? 0;
    await recordChargedEntryFee(client, 'entry-1', charged);
    return { row: rows[0], charged, writes };
  }

  it('a NULL-fee entry is priced at the fallback tier, paid, and its fee is RECORDED', async () => {
    const { row, charged } = await recover(null);
    expect(charged).toBe(3000);
    expect(row.entry_fee).toBe(30);
  });

  it('a 0-fee entry records the charged fallback amount too', async () => {
    const { row, charged } = await recover(0);
    expect(charged).toBe(3000);
    expect(row.entry_fee).toBe(30);
  });

  it('a recovered entry frozen at 15.00 stays at 15', async () => {
    const { row, charged, writes } = await recover('15.00');
    expect(charged).toBe(1500);
    expect(row.entry_fee).toBe('15.00');
    // The UPDATE carries the NULL-or-0 condition, so even a racing positive fee
    // survives; it matched no row.
    expect(writes[0].filter).toBe('entry_fee.is.null,entry_fee.eq.0');
  });

  it('stripe-refund-entry computes a refundable amount equal to what was charged', async () => {
    for (const fee of [null, 0, '15.00']) {
      const { row, charged } = await recover(fee);
      // stripe-refund-entry reads storedFeeToCents(entries.entry_fee).
      expect(storedFeeToCents(row.entry_fee)).toBe(charged);
    }
  });

  it('a read-back that already holds a positive fee is a no-op, not an error', async () => {
    const rows: Row[] = [{ id: 'entry-1', entry_fee: 15 }];
    const { client } = fakeClient(rows);
    expect(await recordChargedEntryFee(client, 'entry-1', 3000)).toEqual({
      recorded: false,
      error: null,
    });
    expect(rows[0].entry_fee).toBe(15);
  });
});

describe('storedFeeToCents', () => {
  it('reads dollars as cents and NULL as zero', () => {
    expect(storedFeeToCents('15.00')).toBe(1500);
    expect(storedFeeToCents(30)).toBe(3000);
    expect(storedFeeToCents(null)).toBe(0);
    expect(storedFeeToCents('abc')).toBe(0);
  });
});
