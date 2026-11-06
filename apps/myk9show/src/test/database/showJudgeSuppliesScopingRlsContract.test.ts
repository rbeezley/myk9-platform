import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// MYK9-1728 (continues SA-007): every show_judge_supplies policy must be scoped
// to show managers via can_manage_show(show_id), not auth.uid() alone, and the
// table must be closed to anon.
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20261106213700_myk9_1728_show_judge_supplies.sql'
  ),
  'utf8'
);

const POLICIES = ['select', 'insert', 'update', 'delete'] as const;

describe('show_judge_supplies scoping RLS contract (MYK9-1728)', () => {
  it('creates all four policies for authenticated only', () => {
    for (const cmd of POLICIES) {
      expect(migration).toContain(
        `CREATE POLICY "show_judge_supplies_${cmd}" ON public.show_judge_supplies`
      );
    }
    expect(migration).not.toContain('TO anon;\n');
  });

  it('gates every policy on is_site_admin or can_manage_show(show_id)', () => {
    // select/delete use it once, insert once (WITH CHECK), update twice (USING + WITH CHECK).
    const scopeCount =
      migration.split('public.can_manage_show(show_judge_supplies.show_id)').length - 1;
    expect(scopeCount).toBe(5);
    expect(migration.split('public.is_site_admin()').length - 1).toBe(5);
  });

  it('leaves no policy gated on the permissive auth.uid() IS NOT NULL predicate', () => {
    const sql = migration.slice(migration.indexOf('CREATE POLICY'));
    expect(sql).not.toContain('auth.uid() IS NOT NULL');
  });

  it('forces RLS and revokes anon before granting authenticated', () => {
    expect(migration).toContain('ALTER TABLE public.show_judge_supplies ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE public.show_judge_supplies FORCE ROW LEVEL SECURITY');
    const revoke = migration.indexOf(
      'REVOKE ALL ON public.show_judge_supplies FROM PUBLIC, anon, authenticated'
    );
    const grant = migration.indexOf(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.show_judge_supplies TO authenticated'
    );
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
  });

  it('carries rows over before dropping the per-trial table, and redefines the manifest', () => {
    const insert = migration.indexOf('INSERT INTO public.show_judge_supplies');
    const drop = migration.indexOf('DROP TABLE public.trial_judge_supplies');
    expect(insert).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(insert);
    expect(migration).toContain('"constraint_name" : "show_judge_supplies_show_id_fkey"');
    expect(migration).not.toContain('"constraint_name" : "trial_judge_supplies_trial_id_fkey"');
  });
});
