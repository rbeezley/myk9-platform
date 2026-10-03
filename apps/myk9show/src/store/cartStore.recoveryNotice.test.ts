/**
 * MYK9-873: a Finish Payment link names specific entries. `loadActiveCart`
 * settles the cart once (reconciliation, closed classes, and a refill from the
 * link when that leaves it EMPTY) and stores the link's outcome, keyed by the
 * link so it exists even with no cart. A recovery that FAILED (lookup or upsert
 * error) is not an eligibility answer: it shows a retryable error, never a notice.
 * The pure description is table-tested in cartStore.paymentLink.test.ts; this
 * pins what the store does for each state.
 *
 * The tables are a small in-memory world with the real column shapes; `entries`
 * answers the recovery lookup and the reconciliation read from the same rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface EntryRow {
  id: string;
  dog_id: string;
  class_id: string;
  payment_status: string;
}
interface ItemRow {
  id: string;
  cart_id: string;
  dog_id: string;
  class_id: string;
  entry_id: string | null;
  entry_fee_cents: number;
}

const world = vi.hoisted(() => ({
  hasCartShell: true,
  entries: [] as EntryRow[],
  items: [] as ItemRow[],
  lookupError: false,
  upsertError: false,
  upserts: 0,
}));

vi.mock('@/lib/supabase', () => {
  const make = (table: string) => {
    const state: {
      select?: string;
      ids?: unknown[];
      isDelete?: boolean;
      isInsert?: boolean;
      upsert?: Array<Record<string, unknown>>;
    } = {};
    const builder: Record<string, unknown> = {};
    for (const method of ['eq', 'or', 'is', 'order', 'limit', 'gt']) {
      builder[method] = () => builder;
    }
    builder.in = (column: string, values: unknown[]) => {
      if (column === 'id') state.ids = values;
      return builder;
    };
    builder.select = (columns: string) => {
      state.select = columns;
      return builder;
    };
    builder.update = () => builder;
    builder.delete = () => {
      state.isDelete = true;
      return builder;
    };
    builder.insert = () => {
      state.isInsert = true;
      return builder;
    };
    builder.upsert = (payload: Array<Record<string, unknown>>) => {
      state.upsert = payload;
      return builder;
    };
    const cartRow = {
      id: 'cart-1',
      show_id: 'show-1',
      exhibitor_id: 'exhibitor-1',
      status: 'active',
      expires_at: '2999-01-01T00:00:00.000Z',
      subtotal_cents: 0,
      platform_fee_cents: 0,
      total_cents: 0,
      stripe_checkout_session_id: null,
      show: { id: 'show-1', name: 'Link Trial', start_date: '2999-02-01', entry_close_date: null },
    };
    const resolve = (): { data: unknown; error: unknown } => {
      if (table === 'entry_carts') {
        if (state.isInsert) return { data: cartRow, error: null };
        if (state.select?.includes('show:shows')) return { data: cartRow, error: null };
        if (state.select) {
          return {
            data: world.hasCartShell
              ? [
                  {
                    id: 'cart-1',
                    show_id: 'show-1',
                    status: 'active',
                    expires_at: cartRow.expires_at,
                  },
                ]
              : [],
            error: null,
          };
        }
        return { data: null, error: null };
      }
      if (table === 'entry_cart_items') {
        if (state.upsert) {
          world.upserts += 1;
          if (world.upsertError) return { data: null, error: { message: 'upsert failed' } };
          for (const row of state.upsert) {
            world.items.push({
              id: `item-${row.entry_id as string}`,
              cart_id: row.cart_id as string,
              dog_id: row.dog_id as string,
              class_id: row.class_id as string,
              entry_id: row.entry_id as string,
              entry_fee_cents: row.entry_fee_cents as number,
            });
          }
          return { data: null, error: null };
        }
        if (state.isDelete) {
          world.items = world.items.filter(item => !state.ids?.includes(item.id));
          return { data: null, error: null };
        }
        return { data: world.items.map(item => ({ ...item })), error: null };
      }
      if (table === 'exhibitor_profiles') return { data: { person_id: 'person-1' }, error: null };
      if (table === 'dogs') return { data: [{ id: 'dog-1' }], error: null };
      if (table === 'entries') {
        if (state.select?.includes('class:classes')) {
          if (world.lookupError) return { data: null, error: { message: 'lookup failed' } };
          return {
            data: world.entries
              .filter(e => e.payment_status === 'pending' && (state.ids ?? []).includes(e.id))
              .map(e => ({
                ...e,
                handler_id: null,
                entry_fee: 25,
                jump_height: null,
                special_requests: null,
                class: { entry_fee: 25 },
                show: { pre_entry_fee: 25, day_of_show_fee: null, start_date: '2999-02-01' },
              })),
            error: null,
          };
        }
        return { data: world.entries, error: null };
      }
      return { data: null, error: null };
    };
    builder.single = () => Promise.resolve(resolve());
    builder.maybeSingle = () => Promise.resolve(resolve());
    builder.then = (onOk: (value: unknown) => void, onErr?: (reason?: unknown) => void) =>
      Promise.resolve(resolve()).then(onOk, onErr);
    return builder;
  };
  return {
    supabase: {
      from: make,
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
  };
});
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useCartStore } from './cartStore';

const RETRY_MESSAGE =
  'We could not check the entries in your payment link. Please reload the page to try again.';

function entry(id: string, payment_status = 'pending'): EntryRow {
  return { id, dog_id: 'dog-1', class_id: `class-${id}`, payment_status };
}
function line(entryId: string): ItemRow {
  return {
    id: `item-${entryId}`,
    cart_id: 'cart-1',
    dog_id: 'dog-1',
    class_id: `class-${entryId}`,
    entry_id: entryId,
    entry_fee_cents: 2500,
  };
}

const load = (recoveryEntryIds: string[]) =>
  useCartStore.getState().loadActiveCart('exhibitor-1', { showId: 'show-1', recoveryEntryIds });

beforeEach(() => {
  useCartStore.getState().reset();
  Object.assign(world, {
    hasCartShell: true,
    entries: [],
    items: [],
    lookupError: false,
    upsertError: false,
    upserts: 0,
  });
});

const outcome = () => useCartStore.getState().paymentLinkOutcome;

describe('payment-link outcome in the store (MYK9-873)', () => {
  it('no cart shell and every linked entry unavailable: none-left, with no cart', async () => {
    world.hasCartShell = false;
    world.entries = [entry('e1', 'paid'), entry('e2', 'paid')];

    const cart = await load(['e2', 'e1']);

    expect(cart).toBeNull();
    expect(outcome()).toEqual({
      linkKey: 'e1,e2',
      kind: 'none-left',
      requested: 2,
      unavailable: 2,
      stillUnpaid: 0,
    });
    expect(useCartStore.getState().error).toBeNull();
  });

  it('an existing cart holding only some linked entries: some-missing, never backfilled', async () => {
    world.entries = [entry('e1'), entry('e2'), entry('e3', 'paid')];
    world.items = [line('e1')];

    const cart = await load(['e1', 'e2', 'e3']);

    expect(cart?.items.map(item => item.entry_id)).toEqual(['e1']);
    expect(world.upserts).toBe(0);
    expect(outcome()).toMatchObject({ kind: 'some-missing', unavailable: 1, stillUnpaid: 1 });
  });

  it('a linked line reconciliation removed as paid counts as unavailable', async () => {
    world.entries = [entry('e1'), entry('e2', 'paid')];
    world.items = [line('e1'), line('e2')];

    const cart = await load(['e1', 'e2']);

    expect(cart?.items.map(item => item.entry_id)).toEqual(['e1']);
    expect(outcome()).toMatchObject({ kind: 'some-missing', unavailable: 1, stillUnpaid: 0 });
  });

  it('a cart emptied by reconciliation is refilled with the unpaid linked entry', async () => {
    // Codex round 2: the cart held only a now-paid entry and the link names another
    // unpaid one. Left empty, the notice said "pay this cart first" with nothing to pay.
    world.entries = [entry('e1', 'paid'), entry('e2')];
    world.items = [line('e1')];

    const cart = await load(['e2']);

    expect(world.upserts).toBe(1);
    expect(cart?.items.map(item => item.entry_id)).toEqual(['e2']);
    expect(outcome()).toMatchObject({ kind: 'all-present', unavailable: 0, stillUnpaid: 0 });
  });

  it('an empty shell is rebuilt from the link and counts what it could not rebuild', async () => {
    world.entries = [entry('e1'), entry('e2', 'paid')];

    const cart = await load(['e1', 'e2', 'e3']);

    expect(cart?.items.map(item => item.entry_id)).toEqual(['e1']);
    expect(outcome()).toMatchObject({ kind: 'some-missing', requested: 3, unavailable: 2 });
  });

  it('every linked entry in the cart: all-present, no error', async () => {
    world.entries = [entry('e1'), entry('e2')];

    await load(['e1', 'e2']);

    expect(outcome()).toMatchObject({ kind: 'all-present', unavailable: 0, stillUnpaid: 0 });
    expect(useCartStore.getState().error).toBeNull();
  });

  it('a failed lookup is a retryable error and clears any outcome', async () => {
    world.entries = [entry('e1'), entry('e2')];
    world.items = [line('e1')];
    world.lookupError = true;
    useCartStore.setState({
      paymentLinkOutcome: {
        linkKey: 'e1,e2',
        kind: 'some-missing',
        requested: 2,
        stillUnpaid: 0,
        unavailable: 1,
      },
    });

    await load(['e1', 'e2']);

    expect(useCartStore.getState().error).toBe(RETRY_MESSAGE);
    expect(outcome()).toBeNull();
    expect(world.upserts).toBe(0);
  });

  it('a failed rebuild (upsert) is a retryable error, not an outcome', async () => {
    world.entries = [entry('e1'), entry('e2')];
    world.upsertError = true;

    await load(['e1', 'e2']);

    expect(world.upserts).toBe(1);
    expect(useCartStore.getState().error).toBe(RETRY_MESSAGE);
    expect(outcome()).toBeNull();
  });

  it('a failed lookup with no cart shell is the retryable error too', async () => {
    world.hasCartShell = false;
    world.entries = [entry('e1')];
    world.lookupError = true;

    const cart = await load(['e1']);

    expect(cart).toBeNull();
    expect(useCartStore.getState().error).toBe(RETRY_MESSAGE);
    expect(outcome()).toBeNull();
  });
});
