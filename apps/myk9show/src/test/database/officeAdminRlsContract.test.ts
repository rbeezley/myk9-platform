import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migrationPath = join(
  repoRoot,
  'supabase/migrations/20260801120000_remove_steward_office_writes.sql'
);

function policyBlock(source: string, policyName: string, nextPolicyName: string): string {
  const start = source.indexOf(`CREATE POLICY "${policyName}"`);
  expect(start, `Missing ${policyName} policy`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(`CREATE POLICY "${nextPolicyName}"`, start);
  expect(end, `Missing ${nextPolicyName} policy`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('MYK9-147 office-admin RLS migration contract', () => {
  it('keeps steward/chairman roles out of office mutation policies', () => {
    const source = readFileSync(migrationPath, 'utf8');

    for (const [policy, nextPolicy] of [
      ['judge_assignments_insert', 'judge_assignments_update'],
      ['judge_assignments_update', 'judge_assignments_delete'],
      ['judge_assignments_delete', 'enrollments_insert'],
      ['enrollments_insert', 'enrollments_update'],
    ] as const) {
      const block = policyBlock(source, policy, nextPolicy);
      expect(block).not.toContain('is_show_official');
      expect(block).toContain('is_show_office_manager');
    }

    const helper = source.slice(
      source.indexOf('CREATE OR REPLACE FUNCTION public.is_show_office_manager'),
      source.indexOf('REVOKE ALL ON FUNCTION public.is_show_office_manager')
    );
    expect(helper).toContain("r.name IN ('secretary', 'trial_secretary')");
    expect(helper).toContain('ur.show_id = check_show_id');
    expect(helper).toContain('ur.show_id IS NULL AND ur.club_id = s.club_id');
    expect(helper).toContain('ur.is_active = true');
    expect(helper).toContain('(ur.expires_at IS NULL OR ur.expires_at > now())');
  });
});
