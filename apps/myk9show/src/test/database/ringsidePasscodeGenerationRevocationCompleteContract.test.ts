import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// J1.3 (judge-verification-remediation R2, code-review follow-up): passcode
// regeneration must revoke a stamped claim at EVERY endpoint that honors it —
// not just the two write RPCs. This migration centralizes the check in
// ringside_claim_generation_current() and applies it to the read view, both
// write RPCs, and the scoring-state refresh fn, and makes validate_passcode
// return the generation atomically. Static SQL-content contracts (behavioral
// proof runs live against staging in a rolled-back transaction).

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260710160000_ringside_passcode_generation_revocation_complete.sql'
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

describe('ringside passcode-generation revocation (complete) — migration contract', () => {
  describe('ringside_claim_generation_current helper', () => {
    const fn = sliceBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.ringside_claim_generation_current',
      'COMMENT ON FUNCTION public.ringside_claim_generation_current'
    );

    it('is a SECURITY DEFINER STABLE fn with an empty search_path', () => {
      expect(fn).toContain('SECURITY DEFINER');
      expect(fn).toContain('STABLE');
      expect(fn).toContain("SET search_path = ''");
    });

    it('returns NULL when there is no ringside_passcode claim (three-state)', () => {
      // NULL lets a client distinguish "revoked" (FALSE) from "no claim" (NULL).
      expect(fn).toContain(
        "WHEN (auth.jwt() -> 'app_metadata' ->> 'kind') IS DISTINCT FROM 'ringside_passcode'"
      );
      expect(fn).toMatch(/IS DISTINCT FROM 'ringside_passcode'\s*\n\s*THEN NULL/);
    });

    it('matches the stamped generation to the live show_passcodes.created_at', () => {
      expect(fn).toContain('FROM public.show_passcodes sp');
      expect(fn).toContain(
        "(auth.jwt() -> 'app_metadata' ->> 'passcode_generation')::timestamptz = sp.created_at"
      );
    });

    it('is granted to authenticated so the heartbeat can poll it without push', () => {
      expect(migration).toContain(
        'GRANT EXECUTE ON FUNCTION public.ringside_claim_generation_current() TO authenticated'
      );
    });
  });

  describe('validate_passcode', () => {
    it('returns the generation (created_at) atomically with the hash match', () => {
      expect(migration).toContain('DROP FUNCTION IF EXISTS public.validate_passcode(text)');
      expect(migration).toContain(
        'RETURNS TABLE (show_id uuid, role text, passcode_generation timestamptz)'
      );
      expect(migration).toContain('select sp.show_id, sp.role, sp.created_at');
      // Preserves the soft-deleted-show filter (defense-in-depth; must not
      // regress the intentional fix from 20260526013506).
      expect(migration).toContain('join public.shows s on s.id = sp.show_id');
      expect(migration).toContain('and s.deleted_at is null');
      // Still service-role-only.
      expect(migration).toContain(
        'GRANT EXECUTE ON FUNCTION public.validate_passcode(text) TO service_role'
      );
    });
  });

  describe('view_authenticated_entry_results', () => {
    const view = sliceBetween(
      migration,
      'CREATE OR REPLACE VIEW public.view_authenticated_entry_results',
      'GRANT SELECT ON public.view_authenticated_entry_results TO authenticated'
    );

    it('ANDs the generation helper into claim_show_match (narrows, never widens)', () => {
      // claim_show_match feeds BOTH is_ringside_claim (row admission) and
      // can_view_scores, so gating it there revokes read + score for a stale claim.
      expect(view).toContain('AND public.ringside_claim_generation_current()');
      expect(view).toMatch(
        /= e\.show_id::text\s*\n\s*AND public\.ringside_claim_generation_current\(\)\s*\n\s*\) AS claim_show_match/
      );
    });

    it('leaves can_view_admin (financial/PII) exactly managers + owner', () => {
      expect(view).toContain('(flags.can_manage OR flags.is_own_entry) AS can_view_admin');
    });
  });

  describe('refresh_class_scoring_state_authorized', () => {
    const fn = sliceBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state_authorized',
      'REVOKE ALL ON FUNCTION public.refresh_class_scoring_state_authorized'
    );

    it('raises the regeneration 42501 in the passcode-claim arm only', () => {
      expect(fn).toContain(
        'IF v_has_judge_claim\n     AND NOT (v_is_manager OR v_is_assigned_judge)\n     AND public.ringside_claim_generation_current() IS DISTINCT FROM true THEN'
      );
      expect(fn).toContain("RAISE EXCEPTION 'Passcode has been regenerated; re-enter a new code'");
    });
  });

  describe('write RPCs delegate to the helper', () => {
    it('ringside_update_entry gates its passcode-claim arm on the helper', () => {
      const fn = sliceBetween(
        migration,
        'CREATE OR REPLACE FUNCTION public.ringside_update_entry',
        'REVOKE ALL ON FUNCTION public.ringside_update_entry'
      );
      expect(fn).toContain(
        'IF (v_has_judge_claim OR v_has_steward_claim)\n     AND NOT (v_is_manager OR v_is_assigned_judge OR v_is_steward)\n     AND public.ringside_claim_generation_current() IS DISTINCT FROM true THEN'
      );
      // OCC logic preserved.
      expect(fn).toContain("USING errcode = '40001', detail = v_current_version::text");
    });

    it('upsert_ringside_session gates its passcode arm and leaves the account arm intact', () => {
      const fn = sliceBetween(
        migration,
        'create or replace function public.upsert_ringside_session',
        'revoke all on function public.upsert_ringside_session'
      );
      expect(fn).toContain(
        'if public.ringside_claim_generation_current() is distinct from true then'
      );
      expect(fn).toContain('v_show_id := public._account_ringside_show_id(p_route)');
    });
  });
});
