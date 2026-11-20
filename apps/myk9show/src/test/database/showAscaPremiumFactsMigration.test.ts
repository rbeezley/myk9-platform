/**
 * MYK9-2290: the migration adds the four ASCA premium facts to shows as nullable columns, with a
 * CHECK on each of the two choices and no column-level grant (shows has table-level grants, so
 * the columns are readable by anon exactly like their siblings).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20261120224900_myk9_2290_show_asca_premium_facts.sql'
  ),
  'utf8'
).replace(/--.*$/gm, '');
const flat = sql.replace(/\s+/g, ' ');

describe('20261120224900_myk9_2290_show_asca_premium_facts.sql', () => {
  it.each([
    'asca_sanction_status text',
    'scents_by_level text',
    'spectators_policy text',
    'photographer_contact text',
  ])('adds %s, nullable, with no default', column => {
    expect(flat).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    expect(flat).not.toMatch(new RegExp(`${column} (NOT NULL|DEFAULT)`));
  });

  it('restricts the two choices to their values and allows null', () => {
    expect(flat).toContain(
      "CHECK (asca_sanction_status IS NULL OR asca_sanction_status IN ('pending', 'approved'))"
    );
    expect(flat).toContain(
      "CHECK (spectators_policy IS NULL OR spectators_policy IN ('allowed', 'not_allowed'))"
    );
  });

  it('adds no column-level grant or revoke (table-level grants cover the new columns)', () => {
    expect(flat).not.toMatch(/GRANT |REVOKE /);
  });

  it('runs in one transaction', () => {
    expect(flat).toMatch(/^ ?BEGIN; .* COMMIT; ?$/);
  });
});
