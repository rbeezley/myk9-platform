import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Textual smoke check for the Phase 1 style-rename migration. We do not run
// the SQL — that requires a live database. We assert the migration text
// contains the right remap clauses and is idempotent (its WHERE clause
// prevents a second pass from changing rows already on the new vocabulary).

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../../../../supabase/migrations/191_rename_premium_styles.sql'
);

describe('191_rename_premium_styles migration', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');

  it('targets the club_premium_templates table', () => {
    expect(sql).toMatch(/update\s+public\.club_premium_templates/i);
  });

  it('remaps classic -> monogram', () => {
    expect(sql).toMatch(/when\s+'classic'\s+then\s+'monogram'/i);
  });

  it('remaps modern -> banner', () => {
    expect(sql).toMatch(/when\s+'modern'\s+then\s+'banner'/i);
  });

  it('remaps minimal -> headline', () => {
    expect(sql).toMatch(/when\s+'minimal'\s+then\s+'headline'/i);
  });

  it('scopes the UPDATE with a WHERE that lists only the legacy keys (idempotency guard)', () => {
    // Without this WHERE clause, re-running the migration would still match
    // every row. The WHERE clause means rows already on the new names are
    // untouched on a second pass.
    expect(sql).toMatch(/where\s+style\s+in\s*\(\s*'classic'\s*,\s*'modern'\s*,\s*'minimal'\s*\)/i);
  });

  it('updates the column default to monogram', () => {
    expect(sql).toMatch(/alter\s+column\s+style\s+set\s+default\s+'monogram'/i);
  });

  it('adds a check constraint covering all 8 new style identifiers', () => {
    for (const style of [
      'monogram',
      'banner',
      'headline',
      'magazine',
      'poster',
      'gazette',
      'fieldGuide',
      'heritage',
    ]) {
      expect(sql).toContain(`'${style}'`);
    }
  });
});
