/**
 * MYK9-879, last hop: the junior-handler declaration must reach the
 * `entry_cart_items` INSERT. A unit test on the pure pricing function cannot see
 * a dropped field, so this drives the real `addItem` and reads the payload the
 * database receives.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const inserts = vi.hoisted(() => [] as unknown[]);
const mockFrom = vi.hoisted(() => vi.fn());

class InsertBuilder {
  private payload: unknown;
  insert(payload: unknown) {
    this.payload = payload;
    inserts.push(payload);
    return this;
  }
  select() {
    return this;
  }
  update() {
    return this;
  }
  eq() {
    return this;
  }
  single() {
    return Promise.resolve({ data: { ...(this.payload as object), id: 'item-new' }, error: null });
  }
  then(resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) {
    return Promise.resolve({ data: null, error: null }).then(resolve, reject);
  }
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useCartStore } from './cartStore';
import type { CartState } from './cartStore.types';

describe('cartStore.addItem junior declaration', () => {
  beforeEach(() => {
    inserts.length = 0;
    mockFrom.mockReset();
    mockFrom.mockImplementation(() => new InsertBuilder());
    useCartStore.setState({
      cart: {
        id: 'cart-1',
        show_id: 'show-1',
        exhibitor_id: 'exhibitor-1',
        status: 'active',
        expires_at: '2099-01-01T00:00:00.000Z',
        created_at: '2026-09-15T00:00:00.000Z',
        updated_at: '2026-09-15T00:00:00.000Z',
        subtotal_cents: 0,
        platform_fee_cents: 0,
        total_cents: 0,
        stripe_checkout_session_id: null,
        items: [],
      } as unknown as CartState['cart'],
      error: null,
    });
  });

  it('inserts junior_fee_declared with the line and the junior fee in cents', async () => {
    const added = await useCartStore.getState().addItem({
      dogId: 'dog-1',
      classId: 'class-1',
      entryFeeCents: 1500,
      juniorFeeDeclared: true,
    });
    expect(added).toBe(true);
    expect(inserts[0]).toMatchObject({
      cart_id: 'cart-1',
      dog_id: 'dog-1',
      class_id: 'class-1',
      entry_fee_cents: 1500,
      junior_fee_declared: true,
    });
  });

  it('does not send a declaration for an ordinary line (the column defaults to false)', async () => {
    await useCartStore
      .getState()
      .addItem({ dogId: 'dog-1', classId: 'class-1', entryFeeCents: 3000 });
    expect(inserts[0]).toMatchObject({ entry_fee_cents: 3000 });
    expect(inserts[0]).not.toHaveProperty('junior_fee_declared');
  });
});
