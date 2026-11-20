/**
 * MYK9-2291: the migration adds two nullable text columns to club_premium_templates and restates
 * only the table-level grants. The effective ACLs are asserted by the behavioral SQL test
 * supabase/tests/myk9_2291_club_template_asca_facts_test.sql (runs in CI).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20261120232100_myk9_2291_club_template_asca_facts.sql'
  ),
  'utf8'
).replace(/--.*$/gm, '');
const flat = sql.replace(/\s+/g, ' ');

describe('20261120232100_myk9_2291_club_template_asca_facts.sql', () => {
  it.each(['limited_mobility_notes text', 'rv_hookup_notes text'])(
    'adds %s, nullable, with no default',
    column => {
      expect(flat).toContain('ALTER TABLE public.club_premium_templates');
      expect(flat).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
      expect(flat).not.toMatch(new RegExp(`${column} (NOT NULL|DEFAULT)`));
    }
  );

  it('restates the table-level grants only: authenticated CRUD, no anon, no column ACLs', () => {
    expect(flat).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.club_premium_templates TO authenticated;'
    );
    expect(flat).toContain('REVOKE ALL ON TABLE public.club_premium_templates FROM anon;');
    expect(flat).not.toMatch(/GRANT [^;]*\([^)]*\)/);
    expect(flat.match(/ALTER TABLE [\w.]+/g)).toEqual([
      'ALTER TABLE public.club_premium_templates',
    ]);
  });

  it('runs in one transaction', () => {
    expect(flat).toMatch(/^ ?BEGIN; .* COMMIT; ?$/);
  });
});
