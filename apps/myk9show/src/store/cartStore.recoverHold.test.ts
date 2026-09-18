/**
 * Reactivating a lapsed cart can collide with the very index it is there to
 * re-arm (MYK9-581, review C P2-1). When it does, the row that already owns the
 * active slot is the cart `/cart`, the header badge and `stripe-checkout` all
 * read, so it — not the expired one — is what recovery must return.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  op: 'update' | 'select';
  payload?: Record<string, unknown>;
  eqs: Array<{ column: string; value: unknown }>;
}

const calls = vi.hoisted(() => [] as Call[]);
const mockFrom = vi.hoisted(() => vi.fn());
const script = vi.hoisted(() => ({
  updates: [] as Array<{ error: unknown }>,
  activeRow: { data: null as unknown, error: null as unknown },
}));

class MockBuilder {
  private readonly call: Call = { op: 'select', eqs: [] };
  constructor() {
    calls.push(this.call);
  }
  update(payload: Record<string, unknown>) {
    this.call.op = 'update';
    this.call.payload = payload;
    return this;
  }
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.call.eqs.push({ column, value });
    return this;
  }
  in(column: string, value: unknown) {
    this.call.eqs.push({ column: `in:${column}`, value });
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  private result() {
    if (this.call.op === 'update') {
      return { data: null, error: script.updates.shift()?.error ?? null };
    }
    return { data: script.activeRow.data ?? null, error: script.activeRow.error ?? null };
  }
  maybeSingle() {
    return Promise.resolve(this.result());
  }
  then(resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { ACTIVE_CART_UNIQUE_INDEX } from './cartStore.ensureCart';
import { recoverCartHold } from './cartStore.recoverHold';

const EXPIRED_ROW = {
  id: 'cart-expired',
  show_id: 'show-1',
  status: 'expired',
  expires_at: new Date(0).toISOString(),
};
const INDEX_CONFLICT = {
  code: '23505',
  message: `duplicate key value violates unique constraint "${ACTIVE_CART_UNIQUE_INDEX}"`,
  details: null,
};

beforeEach(() => {
  calls.length = 0;
  script.updates = [];
  script.activeRow = { data: null, error: null };
  mockFrom.mockImplementation(() => new MockBuilder());
});

describe('recoverCartHold', () => {
  it('reactivates the row and extends its hold, scoped so a terminal cart cannot be revived', async () => {
    const before = Date.now();
    const result = await recoverCartHold(EXPIRED_ROW, 'exhibitor-1');

    expect(result).toMatchObject({ kind: 'recovered' });
    if (result.kind === 'recovered') {
      expect(result.row.id).toBe('cart-expired');
      expect(result.row.status).toBe('active');
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThanOrEqual(before);
    }
    const [update] = calls;
    expect(update?.payload).toMatchObject({ status: 'active', stripe_checkout_session_id: null });
    // A submitted or abandoned cart is terminal and must stay that way.
    expect(update?.eqs).toContainEqual({ column: 'in:status', value: ['active', 'expired'] });
  });

  it('recovers the row that already owns the active slot when the index rejects the reactivation', async () => {
    script.updates = [{ error: INDEX_CONFLICT }, { error: null }];
    script.activeRow = {
      data: { id: 'cart-active', show_id: 'show-1', status: 'active', expires_at: null },
      error: null,
    };

    const result = await recoverCartHold(EXPIRED_ROW, 'exhibitor-1');

    expect(result).toMatchObject({ kind: 'recovered' });
    if (result.kind === 'recovered') expect(result.row.id).toBe('cart-active');
    // The second write extends the hold on the ACTIVE row, by its own id.
    const updates = calls.filter(call => call.op === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[1]?.eqs).toContainEqual({ column: 'id', value: 'cart-active' });
    expect(updates[1]?.payload).not.toHaveProperty('status');
  });

  it('fails when the conflicting active row cannot be read', async () => {
    script.updates = [{ error: INDEX_CONFLICT }];
    script.activeRow = { data: null, error: null };

    expect(await recoverCartHold(EXPIRED_ROW, 'exhibitor-1')).toEqual({ kind: 'failed' });
  });

  it('fails on any other write error rather than treating it as a conflict', async () => {
    script.updates = [{ error: { code: '42501', message: 'permission denied' } }];

    expect(await recoverCartHold(EXPIRED_ROW, 'exhibitor-1')).toEqual({ kind: 'failed' });
    expect(calls.filter(call => call.op === 'select')).toEqual([]);
  });
});
