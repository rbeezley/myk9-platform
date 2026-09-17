import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_CART_UNIQUE_INDEX,
  isActiveCartUniqueViolation,
} from '@/store/cartStore.ensureCart';

/**
 * Contract between `entry_carts_active_show_exhibitor_unique_idx` and the code
 * that tolerates it (MYK9-581).
 *
 * The index is `(show_id, exhibitor_id) WHERE status = 'active'` — it knows
 * nothing about `expires_at`. The wizard's opener used to read with
 * `.gt('expires_at', now)`, so an active row whose hold had lapsed was
 * invisible to the read and still fatal to the insert: every wizard open after
 * a cart timed out POSTed a row that could only 409.
 *
 * The behaviour that closes it — recover rather than create, and coalesce the
 * whole opener — is pinned by `cartStore.createCart.test.ts`, which calls the
 * store. What only this file can pin is that the index the migration creates is
 * the one the code matches on, read from the migration text and fed through the
 * real predicate. A source-text grep would be satisfied by a comment naming the
 * index, so everything here is a CALL.
 */
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260906142000_unique_active_cart_per_show_exhibitor.sql'
  ),
  'utf8'
);
const normalizedMigration = migration.replace(/\s+/g, ' ');

/** The index name exactly as the migration spells it. */
function indexNameFromMigration(): string {
  const match = /create unique index[^;]*?(entry_carts_\w+)/i.exec(normalizedMigration);
  expect(match?.[1], 'the migration must still create a unique index on entry_carts').toBeTruthy();
  return match![1] as string;
}

describe('entry_carts active-cart unique index contract', () => {
  it('is on (show_id, exhibitor_id) and scoped to status = active only', () => {
    expect(normalizedMigration).toContain(
      "create unique index if not exists entry_carts_active_show_exhibitor_unique_idx on public.entry_carts (show_id, exhibitor_id) where status = 'active'"
    );
    // If the predicate ever gains an expiry term, the opener may filter on
    // expiry too — until then it must not, which is the bug this pins.
    const predicate = normalizedMigration.slice(
      normalizedMigration.indexOf('entry_carts_active_show_exhibitor_unique_idx')
    );
    expect(predicate).not.toContain('expires_at');
  });

  it('the tolerated index is the one the migration creates', () => {
    expect(ACTIVE_CART_UNIQUE_INDEX).toBe(indexNameFromMigration());
  });

  it('matches the real PostgREST error for that index — which carries no details', () => {
    // Captured from staging: `details` is null, so `message` is the only field
    // that can identify the constraint.
    expect(
      isActiveCartUniqueViolation({
        code: '23505',
        message: `duplicate key value violates unique constraint "${indexNameFromMigration()}"`,
        details: null,
      })
    ).toBe(true);
  });

  it('does not absorb a violation of any other constraint, or any other error code', () => {
    expect(
      isActiveCartUniqueViolation({
        code: '23505',
        message: 'duplicate key value violates unique constraint "entry_carts_some_future_idx"',
        details: 'Key (stripe_checkout_session_id)=(cs_test_1) already exists.',
      })
    ).toBe(false);
    expect(
      isActiveCartUniqueViolation({
        code: '42501',
        message: `permission denied; ${ACTIVE_CART_UNIQUE_INDEX}`,
      })
    ).toBe(false);
    expect(isActiveCartUniqueViolation(null)).toBe(false);
    expect(isActiveCartUniqueViolation({ code: '23505' })).toBe(false);
  });
});
