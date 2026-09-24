// MYK9-639 NCR-2026-09-20-01: one set of entry rows, followed end to end.
//
// The balance summary sends the moved money root's id to checkout, the
// recovery cart keeps that id (and the root's class) on its line, and the
// stripe-webhook loader + reconciler must then settle that same root once.
// Before the fix the loader blocked every `moved` row, so the paid event
// could never stamp the obligation the exhibitor was asked to pay.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from '@/lib/supabase';
import { recoverCartItemsFromEntryIds, type RecoverableEntryRow } from '@/store/cartStore.recovery';

import { reconcileEntryPaymentRequest } from '../../../../supabase/functions/_shared/entryPaymentReconcile';
import {
  loadPaymentReconciliationEntries,
  type FetchReconciliationEntries,
  type PaymentReconciliationEntry,
} from '../../../../supabase/functions/stripe-webhook/paymentReconciliationLoader';
import {
  mapEntryRowToBalanceSource,
  summarizeEntryBalancesFromSource,
} from '../entryBalanceSummary';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));

type DbEntry = PaymentReconciliationEntry & {
  show_id: string;
  class_id: string;
  dog_id: string;
  payment_method: string | null;
  entry_fee: number;
};

const SHOW = { id: 'show-1', name: 'Fall Trial', start_date: '2099-10-10' };

function dbEntry(overrides: Partial<DbEntry> & { id: string; class_id: string }): DbEntry {
  return {
    show_id: SHOW.id,
    dog_id: 'dog-1',
    payment_status: 'pending',
    payment_method: 'online',
    entry_status: 'confirmed',
    entry_fee: 0,
    deleted_at: null,
    moved_from_entry_id: null,
    stripe_payment_intent_id: null,
    ...overrides,
  };
}

const ROOT = dbEntry({
  id: 'root',
  class_id: 'class-novice',
  entry_status: 'moved',
  entry_fee: 35,
});

const CHAINS: Array<[string, DbEntry[]]> = [
  [
    'one hop',
    [ROOT, dbEntry({ id: 'live', class_id: 'class-advanced', moved_from_entry_id: 'root' })],
  ],
  [
    'two hops',
    [
      ROOT,
      dbEntry({
        id: 'mid',
        class_id: 'class-advanced',
        entry_status: 'moved',
        moved_from_entry_id: 'root',
      }),
      dbEntry({ id: 'live', class_id: 'class-excellent', moved_from_entry_id: 'mid' }),
    ],
  ],
];

function entriesTable(rows: DbEntry[]): FetchReconciliationEntries {
  return async (column, ids) => ({
    data: rows.filter(row => ids.includes((row[column] as string | null) ?? '')),
    error: null,
  });
}

/** Chainable PostgREST stand-in that records the recovery cart's upsert. */
function stubCartTables(upserts: unknown[]) {
  const result = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'update']) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data, error: null });
    return chain;
  };
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table === 'entry_cart_items') {
      return {
        upsert: (rows: unknown[]) => {
          upserts.push(...rows);
          return Promise.resolve({ error: null });
        },
        select: () => result(upserts),
      };
    }
    return result(null);
  }) as unknown as typeof supabase.from);
}

describe('moved money root, balance summary to webhook settlement (MYK9-639)', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
  });

  it.each(CHAINS)(
    '%s: the root the summary names is the root that settles, once',
    async (_label, rows) => {
      // 1. Balance summary: the obligation shows on the live run, and payment targets the root.
      const summary = summarizeEntryBalancesFromSource(
        rows.map(row => mapEntryRowToBalanceSource({ ...row, show: SHOW })),
        'confirmed',
        new Date(2099, 5, 1)
      );
      expect(summary.amountDueCents).toBe(3500);
      expect(summary.onlineShowBalances[0]?.displayEntryIds).toEqual(['live']);
      const paymentEntryIds = summary.onlineShowBalances[0]?.entryIds ?? [];
      expect(paymentEntryIds).toEqual(['root']);

      // 2. Recovery cart: the line keeps the root's id and its original class.
      const upserts: Array<{ entry_id: string; class_id: string }> = [];
      stubCartTables(upserts);
      const recoverable: RecoverableEntryRow = {
        id: ROOT.id,
        class_id: ROOT.class_id,
        dog_id: ROOT.dog_id,
        handler_id: null,
        entry_fee: ROOT.entry_fee,
        jump_height: null,
        special_requests: null,
        class_entry_fee: 35,
        show_pre_entry_fee: null,
        show_day_of_show_fee: null,
        show_start_date: SHOW.start_date,
      };
      await recoverCartItemsFromEntryIds({
        cartId: 'cart-1',
        showId: SHOW.id,
        exhibitorId: 'exhibitor-1',
        entryIds: paymentEntryIds,
        recoverableEntries: [recoverable],
      });
      expect(upserts).toEqual([
        expect.objectContaining({
          entry_id: 'root',
          class_id: 'class-novice',
          entry_fee_cents: 3500,
        }),
      ]);

      // 3. Webhook loader, recovery path: the cart line's entry is not blocked.
      const recovered = await loadPaymentReconciliationEntries(
        [upserts[0].entry_id],
        entriesTable(rows)
      );
      expect(recovered.blockedEntryIds).toEqual([]);
      expect(recovered.reconciliationEntryIds).toEqual(['root']);
      expect(recovered.liveEntryIdByRoot).toEqual({ root: 'live' });

      // 4. Webhook loader + reconciler, payment-link path: exactly one stamp, on the root.
      const loaded = await loadPaymentReconciliationEntries(paymentEntryIds, entriesTable(rows));
      const result = reconcileEntryPaymentRequest({
        linkStatus: 'open',
        sessionPaymentStatus: 'paid',
        expectedEntryIds: paymentEntryIds,
        entries: loaded.entries,
        reconciliationEntryIds: loaded.reconciliationEntryIds,
        duplicateEntryIds: loaded.duplicateEntryIds,
        lifecycleEntryIdsByRoot: loaded.lifecycleEntryIdsByRoot,
        blockedEntryIds: loaded.blockedEntryIds,
        paymentIntentId: 'pi_test',
      });
      expect(result.patches.map(patch => patch.id)).toEqual(['root']);
      expect(result.unresolvedEntryIds).toEqual([]);
      expect(result.alreadyPaidEntryIds).toEqual([]);
    }
  );
});
