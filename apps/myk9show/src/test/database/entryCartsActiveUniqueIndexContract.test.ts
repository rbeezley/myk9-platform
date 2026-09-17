import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract between `entry_carts_active_show_exhibitor_unique_idx` and the read
 * the registration wizard opens a cart with (MYK9-581).
 *
 * The index is `(show_id, exhibitor_id) WHERE status = 'active'` — it knows
 * nothing about `expires_at`. The wizard's opener used to read with
 * `.gt('expires_at', now)`, so an active row whose hold had lapsed was
 * invisible to the read and still fatal to the insert: every wizard open after
 * a cart timed out POSTed a row that could only 409
 * (`duplicate key value violates unique constraint
 * "entry_carts_active_show_exhibitor_unique_idx"`).
 *
 * This pins both halves beside each other so the divergence cannot silently
 * return: the index's own scope, and an opener that reads the same rows the
 * index protects (`status IN ('active','expired')`, no expiry filter) and
 * RECOVERS them rather than replacing them.
 */
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260906142000_unique_active_cart_per_show_exhibitor.sql'
  ),
  'utf8'
);
const storeSource = readFileSync(resolve(__dirname, '../../store/cartStore.ts'), 'utf8');
const openerSource = readFileSync(
  resolve(__dirname, '../../store/cartStore.ensureCart.ts'),
  'utf8'
);

/** The `createCart` action body, where the INSERT and its conflict branch live. */
function createCartBody(): string {
  const start = storeSource.indexOf('createCart: async (showId: string, exhibitorId: string)');
  expect(start, 'cartStore must still define a createCart action').toBeGreaterThan(-1);
  const end = storeSource.indexOf('// Add item to cart', start);
  expect(end, 'createCart must still be followed by addItem').toBeGreaterThan(start);
  return storeSource.slice(start, end);
}

describe('entry_carts active-cart unique index contract', () => {
  it('the index is on (show_id, exhibitor_id) and scoped to status = active only', () => {
    const normalized = migration.replace(/\s+/g, ' ');
    expect(normalized).toContain(
      "create unique index if not exists entry_carts_active_show_exhibitor_unique_idx on public.entry_carts (show_id, exhibitor_id) where status = 'active'"
    );
    // If the predicate ever gains an expiry term, the opener below may filter
    // on expiry too — until then it must not.
    const predicate = normalized.slice(
      normalized.indexOf('entry_carts_active_show_exhibitor_unique_idx')
    );
    expect(predicate).not.toContain('expires_at');
  });

  it('the opener names the index it tolerates, by name and not by code alone', () => {
    expect(openerSource).toContain(
      "export const ACTIVE_CART_UNIQUE_INDEX = 'entry_carts_active_show_exhibitor_unique_idx'"
    );
    expect(createCartBody()).toContain('isActiveCartUniqueViolation(cartError)');
  });

  it('the opener reads the rows the index protects and recovers them', () => {
    // `loadActiveCart` is the shared recovery read: status IN
    // ('active','expired') with NO expires_at filter, the same predicate
    // useActiveCartItemCount mirrors for the header badge.
    expect(storeSource).toContain(".in('status', ['active', 'expired'])");
    expect(openerSource).toContain('deps.loadActiveCart(exhibitorId, { showId })');
    expect(createCartBody()).toContain('get().loadActiveCart(exhibitorId, { showId })');
  });

  it('never filters an entry_carts write on expires_at through a PostgREST .or()', () => {
    // Same construct, same table as the 2026-06-20 silent-charge incident: a
    // raw ISO timestamp inside or() misparses and the write fails at runtime.
    for (const source of [storeSource, openerSource]) {
      expect(source).not.toContain('expires_at.is.null');
      expect(source).not.toContain('expires_at.lte.');
      expect(source).not.toContain('expires_at.gt.');
    }
  });

  it('createCart never expires an existing cart to make room for a new one', () => {
    // Retiring the lapsed row and inserting an empty shell makes the drafted
    // cart unreachable from /cart and reads the header badge as 0.
    expect(createCartBody()).not.toContain("status: 'expired'");
  });
});
