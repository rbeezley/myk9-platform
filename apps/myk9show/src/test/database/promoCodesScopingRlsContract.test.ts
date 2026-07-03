import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SA-002: promo_codes INSERT + SELECT must be scoped to show officials, and
// exhibitor validation must go through a validate-only RPC (no catalog SELECT).
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260703123000_scope_promo_codes_rls.sql'
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

describe('promo_codes scoping RLS contract (SA-002)', () => {
  it('drops all four permissive INSERT/SELECT/UPDATE/DELETE policies before recreating them', () => {
    for (const name of ['insert', 'select', 'update', 'delete']) {
      expect(migration).toContain(
        `DROP POLICY IF EXISTS "promo_codes_${name}_policy" ON public.promo_codes`
      );
    }
  });

  it('scopes INSERT to users who manage the row\'s show or trial (not created_by / not any authenticated)', () => {
    const insertPolicy = sliceBetween(
      migration,
      'CREATE POLICY "promo_codes_insert_policy"',
      'CREATE POLICY "promo_codes_select_policy"'
    );
    // dual scope key: show_id direct OR trial_id (RLS-independent can_manage_trial)
    expect(insertPolicy).toContain('public.can_manage_show(promo_codes.show_id)');
    expect(insertPolicy).toContain('public.can_manage_trial(promo_codes.trial_id)');
    expect(insertPolicy).toContain('public.is_site_admin()');
    // creator-integrity invariant preserved: the row must be attributed to the
    // acting user, so a manager cannot spoof created_by via direct PostgREST
    expect(insertPolicy).toContain('promo_codes.created_by = (SELECT auth.uid())');
    // the old permissive full-table predicate must be gone
    expect(insertPolicy).not.toContain('auth.uid() IS NOT NULL');
  });

  it('scopes SELECT to managers only (no auth.uid() IS NOT NULL catalog read)', () => {
    const selectPolicy = sliceBetween(
      migration,
      'CREATE POLICY "promo_codes_select_policy"',
      '-- --- UPDATE'
    );
    expect(selectPolicy).toContain('public.can_manage_show(promo_codes.show_id)');
    expect(selectPolicy).toContain('public.can_manage_trial(promo_codes.trial_id)');
    expect(selectPolicy).not.toContain('auth.uid() IS NOT NULL');
  });

  it('scopes UPDATE + DELETE to managers (closes mig 085 unscoped is_trial_secretary + mig 045 creator-only)', () => {
    const updatePolicy = sliceBetween(
      migration,
      'CREATE POLICY "promo_codes_update_policy"',
      '-- --- DELETE'
    );
    const deletePolicy = sliceBetween(
      migration,
      'CREATE POLICY "promo_codes_delete_policy"',
      'Validate-only RPC'
    );
    for (const policy of [updatePolicy, deletePolicy]) {
      expect(policy).toContain('public.can_manage_show(promo_codes.show_id)');
      expect(policy).toContain('public.can_manage_trial(promo_codes.trial_id)');
      expect(policy).toContain('public.is_site_admin()');
      // the old unscoped predicates must be gone
      expect(policy).not.toContain('is_trial_secretary()');
      expect(policy).not.toContain('created_by = auth.uid()');
    }
    // UPDATE must carry WITH CHECK so a row cannot be re-scoped to a show the
    // caller does not manage
    expect(updatePolicy).toContain('WITH CHECK');
  });

  it('adds a SECURITY DEFINER validate_promo_code RPC granted to authenticated, revoked from PUBLIC', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.validate_promo_code(');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.validate_promo_code(TEXT, UUID, UUID) FROM PUBLIC');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.validate_promo_code(TEXT, UUID, UUID) TO authenticated');
  });

  it('validate RPC returns only match/no-match + discount, never the row set', () => {
    const fn = sliceBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.validate_promo_code(',
      'REVOKE ALL ON FUNCTION public.validate_promo_code'
    );
    expect(fn).toContain('valid BOOLEAN');
    expect(fn).toContain('promo_code_id UUID');
    expect(fn).toContain('discount_type TEXT');
    expect(fn).toContain('discount_value NUMERIC');
    // trial-level precedence preserved
    expect(fn).toContain('ORDER BY (pc.trial_id IS NOT NULL) DESC');
  });
});
