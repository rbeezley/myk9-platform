import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SA-011 (openspec/changes/security-passcode-throttle): upsert_ringside_session
// (the ringside presence heartbeat RPC) previously re-validated a RAW passcode
// inline via validate_passcode() with no throttle, on every 30s heartbeat — a
// brute-force surface that bypassed the validate-passcode edge function's IP
// rate limiter. The fix removes that arm entirely: the RPC now authorizes on the
// forge-proof app_metadata { kind:'ringside_passcode', show_id, ringside_role }
// claim minted by validate-passcode, and is revoked from anon. These are static
// SQL-content contracts (behavioral proof runs live in a rolled-back txn); they
// guard against a future edit silently reopening the brute-force path.

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260704190000_ringside_session_claim_authz.sql'
  ),
  'utf8'
);

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('upsert_ringside_session — SA-011 passcode-throttle contract', () => {
  const fn = sliceBetween(
    migration,
    'create or replace function public.upsert_ringside_session',
    'revoke all on function public.upsert_ringside_session'
  );

  it('no longer re-validates a raw passcode (validate_passcode is not called)', () => {
    // The whole point of SA-011: the un-throttled inline validate_passcode() call
    // and its _hash_passcode helper are gone from the function body. If either
    // reappears, the brute-force surface is back.
    expect(fn).not.toContain('validate_passcode');
    expect(fn).not.toContain('_hash_passcode');
  });

  it('authorizes ONLY on app_metadata, never the user-editable user_metadata (forge-proof)', () => {
    expect(fn).toContain("'app_metadata'");
    // No authz expression may EXTRACT from user_metadata; it may appear only in comments.
    expect(fn).not.toMatch(/user_metadata'\s*->/);
  });

  it('honors the claim ONLY when stamped kind=ringside_passcode (collision-proof marker)', () => {
    expect(fn).toContain("(auth.jwt() -> 'app_metadata' ->> 'kind')");
    expect(fn).toContain("v_claim_kind = 'ringside_passcode'");
  });

  it('takes the show scope from the claim, not from client input', () => {
    expect(fn).toContain("v_claim_show_id := nullif((auth.jwt() -> 'app_metadata' ->> 'show_id'), '')");
    expect(fn).toContain('v_show_id := v_claim_show_id::uuid');
  });

  it('preserves the account (entrant-only) arm unchanged', () => {
    expect(fn).toContain('public._account_ringside_show_id(p_route)');
  });

  it('requires the push subscription to belong to the caller in both arms', () => {
    // Ownership check must appear in each arm (claim + account), not just one.
    const ownershipChecks = fn.match(
      /v_subscription_user_id is distinct from auth\.uid\(\)/g
    );
    expect(ownershipChecks).not.toBeNull();
    expect(ownershipChecks!.length).toBeGreaterThanOrEqual(2);
  });

  it('explicitly revokes the pre-existing anon EXECUTE grant, not just from public', () => {
    expect(migration).toContain(
      'revoke all on function public.upsert_ringside_session(text, text, text[], text) from public'
    );
    // The prior migration (20260531175637) granted EXECUTE to anon EXPLICITLY, and
    // REVOKE ... FROM public does NOT remove a role-specific grant. Without an
    // explicit anon revoke, anon would RETAIN EXECUTE and the hardening is a no-op.
    // This assertion is the one that catches a "revoke from public"-only regression.
    expect(migration).toContain(
      'revoke all on function public.upsert_ringside_session(text, text, text[], text) from anon'
    );
    expect(migration).toContain(
      'grant execute on function public.upsert_ringside_session(text, text, text[], text) to authenticated'
    );
    // The un-throttled path was reachable by anon; the fix must not re-grant it.
    expect(migration).not.toMatch(/grant execute on function public\.upsert_ringside_session[^;]*to[^;]*\banon\b/);
  });
});
