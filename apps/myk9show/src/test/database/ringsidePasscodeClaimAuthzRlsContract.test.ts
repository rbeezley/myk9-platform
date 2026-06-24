import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Phase A+B of docs/plan-ringside-entries-read-authz.md: a ringside PASSCODE
// claim (app_metadata { show_id, ringside_role }, minted by validate-passcode in
// the later Phase C) authorizes the at-show read view + write RPC. These are
// static SQL-content contracts — the behavioral proof ran live against staging
// in a rolled-back transaction. They guard against a future edit silently
// breaking the least-privilege boundaries.

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260624163000_ringside_passcode_claim_authz.sql'
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

describe('ringside passcode-claim authz — RLS/RPC contract', () => {
  it('authorizes ONLY on app_metadata, never the user-editable user_metadata (forge-proof)', () => {
    // user_metadata is self-editable by the end user; authorizing on it would be
    // a privilege-escalation hole. The migration must read app_metadata only.
    expect(migration).toContain("'app_metadata'");
    // No authz expression may EXTRACT from user_metadata (a `user_metadata ->>`
    // access). The string may still appear in explanatory comments.
    expect(migration).not.toMatch(/user_metadata'\s*->/);
  });

  describe('Phase A — view_authenticated_entry_results', () => {
    const view = sliceBetween(
      migration,
      'CREATE OR REPLACE VIEW public.view_authenticated_entry_results',
      'REVOKE SELECT ON public.view_authenticated_entry_results FROM anon'
    );

    it('matches the claim to the row’s own show (show-scoped, not global)', () => {
      expect(view).toContain("'app_metadata' ->> 'show_id'), '') = e.show_id::text");
    });

    it('grants raw scores to judge/admin claims (steward claim excluded)', () => {
      // The judge/admin claim expression feeds can_view_scores...
      expect(view).toMatch(/IN \('judge', 'admin'\)\)\s*\)\s*AS can_view_scores/);
      // ...and can_view_scores is exactly managers + assigned judge + judge/admin claim.
      expect(view).toContain('flags.can_manage');
      expect(view).toContain('flags.is_assigned_judge');
    });

    it('never widens financial/PII visibility to any claim (can_view_admin stays managers+owner)', () => {
      expect(view).toContain('(flags.can_manage OR flags.is_own_entry) AS can_view_admin');
      // The can_view_admin definition must not reference the claim at all.
      const canViewAdmin = sliceBetween(view, ' AS can_view_admin', ') AS access');
      expect(canViewAdmin).not.toContain('claim');
    });

    it('admits the row for any valid ringside claim (judge/steward/admin)', () => {
      expect(view).toContain(
        "flags.claim_role IN ('judge', 'steward', 'admin')) AS is_ringside_claim"
      );
      expect(view).toContain('OR access.is_ringside_claim');
    });

    it('preserves the original account tiers (managers, assigned judge, steward, owner)', () => {
      expect(view).toContain('access.can_manage');
      expect(view).toContain('access.is_assigned_judge');
      expect(view).toContain('access.is_show_steward');
      expect(view).toContain('access.is_own_entry');
    });
  });

  describe('Phase B — ringside_update_entry', () => {
    const fn = sliceBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.ringside_update_entry',
      'REVOKE ALL ON FUNCTION public.ringside_update_entry'
    );

    it('matches the write claim to the entry’s show (v_show_id)', () => {
      expect(fn).toContain('v_claim_show_id = v_show_id::text');
    });

    it('judge/admin claim writes the full ringside set; steward claim does not', () => {
      expect(fn).toContain("v_claim_role IN ('judge', 'admin')");
      expect(fn).toContain("v_claim_role = 'steward'");
      // Allow-list resolution: judge claim joins the scoring tier, steward the runorder tier.
      expect(fn).toContain('v_is_manager OR v_is_assigned_judge OR v_has_judge_claim');
      expect(fn).toContain('v_is_steward OR v_has_steward_claim');
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
});
