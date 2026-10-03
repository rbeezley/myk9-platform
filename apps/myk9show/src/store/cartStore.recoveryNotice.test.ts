/**
 * MYK9-873: a Finish Payment link names specific entries. Whatever the cart ends
 * up holding after recovery AND reconciliation, the exhibitor is told how many
 * linked entries are not in it, split by why:
 *  - `unavailable`: no longer payable (paid, withdrawn, not open for payment);
 *  - `stillUnpaid`: still payable, but this cart does not hold them (an existing
 *    cart is never backfilled).
 * A recovery that FAILED (lookup or upsert error) is not an eligibility answer: it
 * shows a retryable error and never an "entries were left out" notice.
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

describe('payment-link recovery notice (MYK9-873)', () => {
  it('an existing cart holding only some linked entries says which are missing and why', async () => {
    world.entries = [entry('e1'), entry('e2'), entry('e3', 'paid')];
    world.items = [line('e1')];

    const cart = await load(['e1', 'e2', 'e3']);

    expect(cart?.items.map(item => item.entry_id)).toEqual(['e1']);
    // An existing cart is never backfilled.
    expect(world.upserts).toBe(0);
    expect(useCartStore.getState().droppedRecoveryEntries).toEqual({
      cartId: 'cart-1',
      requested: 3,
      stillUnpaid: 1,
      unavailable: 1,
    });
  });

  it('counts a linked line that reconciliation removed because it was paid since', async () => {
    world.entries = [entry('e1'), entry('e2', 'paid')];
    world.items = [line('e1'), line('e2')];

    const cart = await load(['e1', 'e2']);

    expect(cart?.items.map(item => item.entry_id)).toEqual(['e1']);
    expect(useCartStore.getState().droppedRecoveryEntries).toEqual({
      cartId: 'cart-1',
      requested: 2,
      stillUnpaid: 0,
      unavailable: 1,
    });
  });

  it('an empty cart rebuilt from the link counts the entries it could not rebuild', async () => {
    world.entries = [entry('e1'), entry('e2', 'paid')];

    const cart = await load(['e1', 'e2', 'e3']);

    expect(cart?.items.map(item => item.entry_id)).toEqual(['e1']);
    expect(useCartStore.getState().droppedRecoveryEntries).toEqual({
      cartId: 'cart-1',
      requested: 3,
      stillUnpaid: 0,
      unavailable: 2,
    });
  });

  it('records nothing when every linked entry is in the cart', async () => {
    world.entries = [entry('e1'), entry('e2')];

    await load(['e1', 'e2']);

    expect(useCartStore.getState().droppedRecoveryEntries).toBeNull();
    expect(useCartStore.getState().error).toBeNull();
  });

  it('a failed lookup shows a retryable error, not an eligibility notice', async () => {
    world.entries = [entry('e1'), entry('e2')];
    world.lookupError = true;
    useCartStore.setState({
      droppedRecoveryEntries: { cartId: 'cart-1', requested: 2, stillUnpaid: 0, unavailable: 1 },
    });

    await load(['e1', 'e2']);

    expect(useCartStore.getState().error).toBe(RETRY_MESSAGE);
    expect(useCartStore.getState().droppedRecoveryEntries).toBeNull();
    expect(world.upserts).toBe(0);
  });

  it('a failed upsert shows a retryable error, not an eligibility notice', async () => {
    world.entries = [entry('e1'), entry('e2')];
    world.upsertError = true;

    await load(['e1', 'e2']);

    expect(world.upserts).toBe(1);
    expect(useCartStore.getState().error).toBe(RETRY_MESSAGE);
    expect(useCartStore.getState().droppedRecoveryEntries).toBeNull();
  });

  it('a failed lookup with no cart shell left also shows the retryable error', async () => {
    world.hasCartShell = false;
    world.entries = [entry('e1')];
    world.lookupError = true;

    const cart = await load(['e1']);

    expect(cart).toBeNull();
    expect(useCartStore.getState().error).toBe(RETRY_MESSAGE);
    expect(useCartStore.getState().droppedRecoveryEntries).toBeNull();
  });
});
