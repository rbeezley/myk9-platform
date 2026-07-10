import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// J1.3 (judge-verification-remediation R2): passcode regeneration must revoke a
// stamped ringside claim. regenerate_show_passcodes bumps show_passcodes.created_at
// in place, so the ringside RPCs re-check the claim's stamped passcode_generation
// against the current created_at and raise 42501 on a mismatch.
//
// These are static SQL-content contracts (the behavioral proof runs live against
// staging in a rolled-back transaction). They guard against a future edit silently
// dropping the revocation check or loosening its blast radius.

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260710150000_ringside_passcode_generation_revocation.sql'
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

describe('ringside passcode-generation revocation — migration contract', () => {
  it('raises 42501 with the regeneration message the client keys on', () => {
    // The client (ringsidePasscodeRevocation.ts) matches this EXACT message.
    expect(migration).toContain(
      "raise exception 'Passcode has been regenerated; re-enter a new code'"
    );
    expect(migration).toContain(
      "RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'"
    );
    // Both raises must carry the insufficient-privilege SQLSTATE.
    expect(migration).toMatch(/regenerated; re-enter a new code'\s*\n\s*using errcode = '42501'/i);
    expect(migration).toMatch(/regenerated; re-enter a new code'\s*\n\s*USING errcode = '42501'/);
  });

  describe('ringside_update_entry', () => {
    const fn = sliceBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.ringside_update_entry',
      'REVOKE ALL ON FUNCTION public.ringside_update_entry'
    );

    it('compares the stamped generation to the CURRENT show_passcodes.created_at', () => {
      expect(fn).toContain(
        "v_claim_generation := (SELECT auth.jwt()) -> 'app_metadata' ->> 'passcode_generation'"
      );
      expect(fn).toContain('SELECT sp.created_at');
      expect(fn).toContain('FROM public.show_passcodes sp');
      expect(fn).toContain('v_claim_generation::timestamptz IS DISTINCT FROM v_current_generation');
    });

    it('gates the passcode-claim arm ONLY (account tiers fall back, never blocked)', () => {
      // The generation guard fires only when a claim is present AND the caller has
      // no account-based authorization to fall back to.
      expect(fn).toContain(
        'IF (v_has_judge_claim OR v_has_steward_claim)\n' +
          '     AND NOT (v_is_manager OR v_is_assigned_judge OR v_is_steward) THEN'
      );
    });

    it('leaves the OCC/version-conflict logic (40001 + DETAIL) intact', () => {
      expect(fn).toContain("USING errcode = '40001', detail = v_current_version::text");
    });

    it('still revokes from public and grants only to authenticated', () => {
      expect(migration).toContain(
        'REVOKE ALL ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM public'
      );
      expect(migration).toContain(
        'GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) TO authenticated'
      );
    });
  });

  describe('upsert_ringside_session', () => {
    const fn = sliceBetween(
      migration,
      'create or replace function public.upsert_ringside_session',
      'revoke all on function public.upsert_ringside_session'
    );

    it('validates generation inside the passcode-claim arm', () => {
      expect(fn).toContain(
        "v_claim_generation := (auth.jwt() -> 'app_metadata' ->> 'passcode_generation')"
      );
      expect(fn).toContain('select sp.id, sp.created_at');
      expect(fn).toContain('v_claim_generation::timestamptz is distinct from v_current_generation');
    });

    it('leaves the account arm (else branch) authorization untouched', () => {
      // The account arm still derives the show from the caller's own entries.
      expect(fn).toContain('v_show_id := public._account_ringside_show_id(p_route)');
      expect(fn).toContain(
        "raise exception 'account is not entered in exactly one active ringside show'"
      );
    });

    it('still revokes from anon and grants only to authenticated', () => {
      expect(migration).toContain(
        'revoke all on function public.upsert_ringside_session(text, text, text[], text) from anon'
      );
      expect(migration).toContain(
        'grant execute on function public.upsert_ringside_session(text, text, text[], text) to authenticated'
      );
    });
  });
});
