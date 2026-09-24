/**
 * MYK9-656: a recovered cart's classes are re-checked before checkout.
 *
 * Drives the REAL `loadActiveCart` against the in-memory tables with the values
 * `classes_status_check` allows ('upcoming' | 'setup' | 'in_progress' |
 * 'completed' | 'cancelled') and real `entries.is_in_ring` / `is_scored` flags.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeCartDb,
  fakeCart,
  fakeCartItem,
  type FakeCartDb,
  type FakeClassRow,
} from '@/test/utils/fakeCartDb';

const holder = vi.hoisted(() => ({ db: null as unknown as FakeCartDb }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => holder.db.from(table) },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useCartStore } from './cartStore';

const klass = (id: string, name: string, status: string, extra: Partial<FakeClassRow> = {}) => ({
  id,
  name,
  level: 'Novice',
  trial_id: 'trial-1',
  allow_waitlist: false,
  status,
  ...extra,
});

/** A months-old draft: expired, one line per class under test. */
function seedDraft() {
  holder.db = createFakeCartDb({
    carts: [
      fakeCart({
        id: 'cart-draft',
        status: 'expired',
        expires_at: '2026-06-01T00:30:00.000Z',
        created_at: '2026-06-01T00:00:00.000Z',
        stripe_checkout_session_id: 'cs_test_stale',
      }),
    ],
    dogs: [{ id: 'dog-1', name: 'Ch Rover of Oak', call_name: 'Rover' }],
    classes: [
      klass('class-open', 'Novice Interior', 'upcoming'),
      klass('class-cancelled', 'Novice Exterior', 'cancelled'),
      klass('class-finished', 'Novice Containers', 'completed'),
      klass('class-running', 'Novice Buried', 'in_progress'),
      // 'upcoming' on the column, but a dog is already in the ring: the column
      // lags until the first score lands (MYK9-516).
      klass('class-in-ring', 'Advanced Interior', 'upcoming'),
      // Full by the only count the client has (max_entries reached by rows this
      // exhibitor can read). Fullness is not gated here; see classClosure.ts.
      klass('class-full', 'Advanced Exterior', 'upcoming', { max_entries: 1 }),
    ],
    items: [
      'class-open',
      'class-cancelled',
      'class-finished',
      'class-running',
      'class-in-ring',
      'class-full',
    ].map((classId, index) =>
      fakeCartItem({
        id: `item-${classId}`,
        cart_id: 'cart-draft',
        dog_id: 'dog-1',
        class_id: classId,
        created_at: `2026-06-01T00:0${index}:00.000Z`,
      })
    ),
    entries: [
      {
        id: 'entry-other-in-ring',
        show_id: 'show-1',
        class_id: 'class-in-ring',
        dog_id: 'dog-other',
        payment_status: 'paid',
        is_in_ring: true,
        is_scored: false,
        deleted_at: null,
      },
      {
        id: 'entry-other-full',
        show_id: 'show-1',
        class_id: 'class-full',
        dog_id: 'dog-other',
        payment_status: 'paid',
        is_in_ring: false,
        is_scored: false,
        deleted_at: null,
      },
    ],
  });
}

beforeEach(() => {
  useCartStore.getState().reset();
});

describe('recovered cart items in closed classes (MYK9-656)', () => {
  it('drops the cancelled, finished and started classes and keeps the open and full ones', async () => {
    seedDraft();

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1', { showId: 'show-1' });

    expect(cart?.items.map(item => item.class_id).sort()).toEqual(['class-full', 'class-open']);
    // Deleted from the cart, so checkout (which reads the cart by id) cannot
    // be handed them.
    expect(holder.db.items.map(item => item.class_id).sort()).toEqual(['class-full', 'class-open']);
    expect(cart?.subtotal_cents).toBe(6000);
    expect(holder.db.carts[0]?.stripe_checkout_session_id).toBeNull();
  });

  it('tells the exhibitor which classes were removed, and why', async () => {
    seedDraft();

    await useCartStore.getState().loadActiveCart('exhibitor-1', { showId: 'show-1' });

    const dropped = useCartStore.getState().droppedClosedClassItems;
    expect(
      dropped.map(({ dogName, className, reason }) => ({ dogName, className, reason }))
    ).toEqual(
      expect.arrayContaining([
        { dogName: 'Rover', className: 'Novice Exterior', reason: 'This class was cancelled' },
        { dogName: 'Rover', className: 'Novice Containers', reason: 'This class has finished' },
        { dogName: 'Rover', className: 'Novice Buried', reason: 'This class has started' },
        { dogName: 'Rover', className: 'Advanced Interior', reason: 'This class has started' },
      ])
    );
    expect(dropped).toHaveLength(4);
  });

  it('says nothing when every class is still open', async () => {
    holder.db = createFakeCartDb({
      carts: [fakeCart({ id: 'cart-live' })],
      classes: [klass('class-open', 'Novice Interior', 'upcoming')],
      items: [fakeCartItem({ id: 'item-open', cart_id: 'cart-live', class_id: 'class-open' })],
    });

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1', { showId: 'show-1' });

    expect(cart?.items).toHaveLength(1);
    expect(useCartStore.getState().droppedClosedClassItems).toEqual([]);
  });
});
