import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SA-007: every trial_judge_supplies policy must be scoped to show officials
// via a trials join (mirroring 087 trial_checklist_state), not auth.uid() alone.
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260703124000_scope_trial_judge_supplies_rls.sql'
  ),
  'utf8'
);

const POLICIES = ['select', 'insert', 'update', 'delete'] as const;

describe('trial_judge_supplies scoping RLS contract (SA-007)', () => {
  it('drops all four permissive policies before recreating them', () => {
    for (const cmd of POLICIES) {
      expect(migration).toContain(
        `DROP POLICY IF EXISTS "trial_judge_supplies_${cmd}" ON public.trial_judge_supplies`
      );
    }
  });

  it('recreates all four policies with the RLS-independent can_manage_trial predicate', () => {
    for (const cmd of POLICIES) {
      expect(migration).toContain(
        `CREATE POLICY "trial_judge_supplies_${cmd}" ON public.trial_judge_supplies`
      );
    }
    // the scoping predicate appears once per policy (4 total)
    const scopeCount =
      migration.split('public.can_manage_trial(trial_judge_supplies.trial_id)').length - 1;
    expect(scopeCount).toBe(4);
    expect(migration).toContain('public.is_site_admin()');
  });

  it('leaves no policy gated on the old permissive auth.uid() IS NOT NULL predicate', () => {
    // Scope to the executable SQL — the header comment legitimately names the
    // old predicate it replaces.
    const sql = migration.slice(migration.indexOf('DROP POLICY'));
    expect(sql).not.toContain('auth.uid() IS NOT NULL');
  });
});
