/**
 * MYK9-975, Clear Cart edges on a cart that holds a checkout session:
 *
 *   - Another tab fills the one-active-cart slot between the abandon and the new
 *     cart. `createCart` then recovers THAT cart, so Clear Cart did not clear
 *     anything and must say so; the wizard hand-off appends to a cleared cart
 *     and would otherwise add its lines on top (Codex P2 on #2702).
 *   - A cart the webhook already closed (submitted, refund_pending) belongs to
 *     the service role: Clear Cart never writes it and just opens a fresh cart.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeCartDb, fakeCart, fakeCartItem, type FakeCartDb } from '@/test/utils/fakeCartDb';

const holder = vi.hoisted(() => ({
  db: null as unknown as FakeCartDb,
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => holder.db.from(table),
    rpc: (name: string, args: unknown) => holder.rpc(name, args),
  },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { submitRegistrationCartCheckout } from '@/features/registration/registrationCartCheckout';
import { useCartStore } from './cartStore';
import { resetEnsureCartInFlight } from './cartStore.ensureCart';

const STORAGE_KEY = 'myk9-cart-storage';

async function seedAndLoad(sessionId: string) {
  holder.db = createFakeCartDb({
    carts: [fakeCart({ id: 'cart-1', stripe_checkout_session_id: sessionId })],
    items: [fakeCartItem({ id: 'item-1', cart_id: 'cart-1', class_id: 'class-open' })],
    classes: [
      {
        id: 'class-open',
        name: 'Interior Novice A',
        level: 'Novice',
        trial_id: 'trial-1',
        allow_waitlist: false,
        status: 'upcoming',
      },
    ],
    dogs: [{ id: 'dog-1', name: 'Rover Registered', call_name: 'Rover' }],
  });
  await useCartStore.getState().loadActiveCart('exhibitor-1');
  holder.db.log.length = 0;
}

/** Another tab wins the slot right after this tab's abandon write is applied. */
function rivalTabFillsTheSlot() {
  holder.db.carts.push(fakeCart({ id: 'cart-rival', created_at: '2026-09-02T00:00:00.000Z' }));
  holder.db.items.push(
    fakeCartItem({
      id: 'item-rival',
      cart_id: 'cart-rival',
      dog_id: 'dog-2',
      class_id: 'class-open',
    })
  );
}

const isAbandonWrite = (query: { table: string; op: string }) =>
  query.table === 'entry_carts' && query.op === 'update';

beforeEach(() => {
  holder.rpc.mockReset();
  holder.rpc.mockResolvedValue({ data: [], error: null });
  resetEnsureCartInFlight();
  useCartStore.getState().reset();
  localStorage.removeItem(STORAGE_KEY);
});

describe('clearCart when another tab fills the replacement slot', () => {
  it('reports failure and leaves the store showing the cart the exhibitor really has', async () => {
    await seedAndLoad('cs_open');
    const release = holder.db.hold(isAbandonWrite);
    const pending = useCartStore.getState().clearCart();
    await vi.waitFor(() => expect(holder.db.carts[0]?.status).toBe('abandoned'));
    rivalTabFillsTheSlot();
    release();

    expect(await pending).toBe(false);
    const held = useCartStore.getState().cart;
    expect(held?.id).toBe('cart-rival');
    expect(held?.items.map(item => item.id)).toEqual(['item-rival']);
  });

  it('stops the wizard hand-off from appending its selections to that cart', async () => {
    await seedAndLoad('cs_open');
    const release = holder.db.hold(isAbandonWrite);
    const addItem = vi.fn(async () => true);
    const navigate = vi.fn();
    const store = useCartStore.getState();
    const outcome = submitRegistrationCartCheckout({
      showId: 'show-1',
      ownerResolution: { ok: true, ownerId: 'people-1' },
      exhibitorProfileId: 'exhibitor-1',
      classSelections: [
        { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-open' }] },
      ],
      handlerAssignments: {},
      classes: [{ id: 'class-open', entryFee: 30 }],
      showFeeInfo: { preEntryFee: '30', dayOfShowFee: '35', startDate: '2099-05-01' },
      deps: {
        ensureCart: store.ensureCart,
        clearCart: store.clearCart,
        addItem,
        abandonCart: store.abandonCart,
        navigate,
      },
    }).then(
      () => 'resolved',
      (error: Error) => error.message
    );
    await vi.waitFor(() => expect(holder.db.carts[0]?.status).toBe('abandoned'));
    rivalTabFillsTheSlot();
    release();

    expect(await outcome).toBe('Failed to clear existing cart. Please try again.');
    expect(addItem).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('clearCart on a cart the webhook already closed', () => {
  it.each(['fulfilling', 'submitted', 'refund_pending'])(
    'never writes to a %s cart and opens a fresh empty one',
    async status => {
      await seedAndLoad('cs_paid');
      const paid = holder.db.carts.find(cart => cart.id === 'cart-1');
      if (paid) paid.status = status;
      const held = useCartStore.getState().cart;
      if (held) useCartStore.setState({ cart: { ...held, status } });

      expect(await useCartStore.getState().clearCart()).toBe(true);

      expect(holder.db.log.filter(isAbandonWrite)).toEqual([]);
      expect(holder.db.carts.find(cart => cart.id === 'cart-1')).toMatchObject({
        status,
        stripe_checkout_session_id: 'cs_paid',
      });
      const fresh = useCartStore.getState().cart;
      expect(fresh?.id).not.toBe('cart-1');
      expect(fresh?.status).toBe('active');
      expect(fresh?.items).toEqual([]);
    }
  );
});
