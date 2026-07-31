import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract for the cross-tenant guards in create_show_with_children
 * (SA-2026-07-30-01).
 *
 * The RPC is SECURITY DEFINER, so RLS never runs and `p_show.club_id` is the
 * only thing the authorization block sees. Every child INSERT ends in
 * `ON CONFLICT (id) DO NOTHING`, and a no-op conflict is invisible to the code
 * that follows — which is how a secretary of club A could name club B's show or
 * trial id and have their own trials/classes attached to it.
 *
 * The structural fix is that each upsert captures `RETURNING id`, so NULL marks
 * "this row already existed" and the owner can be re-checked. This test pins
 * that shape rather than a filename: the RPC has been rebuilt from a stale base
 * more than once (see 20260726150000's header), and a rebuild that drops the
 * guards would silently reopen the hole. Behavioral proof against a live
 * database lives in
 * `supabase/tests/create_show_with_children_tenant_isolation_test.sql`.
 */
const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');
const RECREATE_MARKER = 'CREATE OR REPLACE FUNCTION public.create_show_with_children';

function readLatestRpcMigration(): { file: string; body: string } {
  const candidates = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .reverse();
  for (const file of candidates) {
    const text = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    if (text.includes(RECREATE_MARKER)) {
      // Only the function definition counts — header comments legitimately
      // describe the exploit they close.
      return { file, body: text.slice(text.indexOf(RECREATE_MARKER)) };
    }
  }
  throw new Error(`No migration re-creates create_show_with_children`);
}

const { file, body } = readLatestRpcMigration();

/** `ON CONFLICT (id) DO NOTHING` immediately followed by a RETURNING capture. */
const GUARDED_UPSERT = /ON CONFLICT \(id\) DO NOTHING\s+RETURNING id INTO (v_\w+)/g;

describe(`create_show_with_children cross-tenant guards (${file})`, () => {
  it('captures the RETURNING id of every ON CONFLICT upsert', () => {
    const conflicts = body.match(/ON CONFLICT \(id\) DO NOTHING/g) ?? [];
    const guarded = [...body.matchAll(GUARDED_UPSERT)];

    // shows, trials, classes.
    expect(conflicts).toHaveLength(3);
    expect(guarded).toHaveLength(3);
  });

  it('re-checks the owning club when the show id already exists', () => {
    expect(body).toMatch(/IF v_inserted_show_id IS NULL THEN/);
    expect(body).toMatch(/SELECT club_id INTO v_owner_club_id/);
    expect(body).toMatch(/v_owner_club_id IS DISTINCT FROM v_club_id/);
    expect(body).toMatch(/belongs to another club/);
  });

  it('re-checks the owning show when a trial id already exists', () => {
    expect(body).toMatch(/IF v_inserted_trial_id IS NULL THEN/);
    expect(body).toMatch(/SELECT show_id INTO v_owner_show_id/);
    expect(body).toMatch(/v_owner_show_id IS DISTINCT FROM v_show_id/);
    expect(body).toMatch(/belongs to another show/);
  });

  it('re-checks the owning trial when a class id already exists', () => {
    expect(body).toMatch(/IF v_inserted_class_id IS NULL THEN/);
    expect(body).toMatch(/SELECT trial_id INTO v_owner_trial_id/);
    expect(body).toMatch(/v_owner_trial_id IS DISTINCT FROM v_class_trial_id/);
    expect(body).toMatch(/belongs to another trial/);
  });

  it('raises 42501 — not a data error — on every ownership violation', () => {
    // A cross-tenant id is an authorization failure. 22023 (invalid parameter)
    // would let the client retry-and-repair it as if it were a payload typo.
    for (const message of [
      'belongs to another club',
      'belongs to another show',
      'belongs to another trial',
    ]) {
      const at = body.indexOf(message);
      expect(at, `${message} missing`).toBeGreaterThan(-1);
      expect(body.slice(at, at + 120)).toContain("ERRCODE = '42501'");
    }
  });

  it('still refuses classes whose trial_id was not part of the request', () => {
    // The pre-existing membership check. It is necessary but was never
    // sufficient: v_inserted_trial_ids accepted a conflicting foreign trial id.
    expect(body).toMatch(/NOT v_class_trial_id = ANY\(v_inserted_trial_ids\)/);
  });

  it('keeps show creation off the anon role', () => {
    const full = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    expect(full).toContain(
      'REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM anon'
    );
    expect(full).toContain(
      'GRANT EXECUTE ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) TO authenticated'
    );
  });
});
