import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * NOTE (MYK9-228): `can_manage_show` is no longer the whole rule.
 * `20260822193000_paperwork_prints_show_scoped_secretary.sql` widened these
 * policies to `can_manage_show(show_id) OR is_show_secretary(show_id)`, because
 * a secretary scoped to one show could read the packet but never confirm
 * printing it. The assertions below still describe the ORIGINAL migration,
 * which is correct as history; the effective policy is asserted in
 * `paperworkPrintsShowScopedSecretary.test.ts`, and per this repo's rule the
 * applied ACL must be verified against the database after `db push`.
 */

const appRoot = resolve(__dirname, '../../..');
const migration = readFileSync(
  resolve(appRoot, '../../supabase/migrations/20260720100000_create_paperwork_prints.sql'),
  'utf8'
);
const behavioralTest = readFileSync(
  resolve(appRoot, '../../supabase/tests/paperwork_prints_rls_test.sql'),
  'utf8'
);

describe('paperwork print authorization contract', () => {
  it('limits read, confirmation, and void access to authenticated Show managers', () => {
    expect(migration).toContain('FOR SELECT TO authenticated');
    expect(migration).toContain('FOR INSERT TO authenticated');
    expect(migration).toContain('FOR UPDATE TO authenticated');
    expect(migration.match(/public\.can_manage_show\(show_id\)/g)).toHaveLength(4);
    expect(migration).toContain('printed_by = (SELECT auth.uid())');
    expect(migration).toContain('voided_by = (SELECT auth.uid())');
    expect(migration).toContain('REVOKE ALL ON TABLE public.paperwork_prints FROM anon, authenticated');
    expect(migration).toContain(
      'GRANT UPDATE (voided_at, voided_by, void_reason) ON TABLE public.paperwork_prints TO authenticated'
    );
  });

  it('keeps executable denial scenarios for unrelated users and append-only facts', () => {
    expect(behavioralTest).toContain('PASS unrelated authenticated user sees no print history');
    expect(behavioralTest).toContain('PASS cross-Show insert rejected');
    expect(behavioralTest).toContain('PASS append-only fact update rejected');
    expect(behavioralTest).toContain('ROLLBACK;');
  });
});
