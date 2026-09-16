import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract for migration 20260916234500 — MYK9-552.
 *
 * `view_public_entry_results` is owner-run (`security_invoker = false`), so its
 * body is the ONLY guard anon meets (LESSONS `#view-predicate-audit`). Migration
 * 20260913131500 added `c.results_released_at IS NOT NULL` to the top-level
 * WHERE, which made every per-column `CASE WHEN c.results_released_at IS NOT
 * NULL THEN … END` arm unreachable while the COMMENT still described the old
 * NULL-the-columns behaviour. This migration removes the dead arms and rewrites
 * the COMMENT; these assertions pin the properties a future edit must not lose.
 */
const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260916234500_view_public_entry_results_comment.sql'
);
const migration = readFileSync(migrationPath, 'utf8');

describe('view_public_entry_results comment/body reconciliation (MYK9-552)', () => {
  it('replaces the view in place, never dropping it (a DROP resets the ACL)', () => {
    expect(migration).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.view_public_entry_results/i);
    expect(migration).not.toMatch(/DROP\s+VIEW[\s\S]*view_public_entry_results/i);
  });

  it('carries the inline security_invoker = false on the replace', () => {
    // LESSONS `#replace-view-reloptions`: CREATE OR REPLACE VIEW resets
    // reloptions, so without the inline WITH the view silently becomes
    // invoker-run and skips the owner-run gate entirely.
    expect(migration).toMatch(
      /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.view_public_entry_results\s*\n?\s*WITH\s*\(\s*security_invoker\s*=\s*false\s*\)/i
    );
  });

  it('keeps the released-results predicate in the top-level WHERE', () => {
    const whereStart = migration.indexOf('  WHERE e.deleted_at IS NULL');
    expect(whereStart).toBeGreaterThanOrEqual(0);
    const where = migration.slice(whereStart, migration.indexOf(';', whereStart));
    expect(where).toContain('c.results_released_at IS NOT NULL');
    expect(where).toContain('c.deleted_at IS NULL');
    expect(where).toContain('sh.deleted_at IS NULL');
  });

  it('removes every dead per-column results_released_at CASE guard', () => {
    expect(migration).not.toMatch(/CASE\s+WHEN\s+c\.results_released_at/i);
    // The per-field visibility guards survive — they are still reachable.
    expect(migration).toMatch(/CASE\s+WHEN\s+vis\.placement_visible\s+THEN\s+e\.final_placement/i);
    expect(migration).toMatch(
      /CASE\s+WHEN\s+vis\.qualification_visible\s+THEN\s+e\.result_status/i
    );
  });

  it('keeps an explicit column list rather than SELECT e.*', () => {
    // LESSONS `#select-star-reexpands`: a star re-expands on every rebuild and
    // publishes whatever columns the base table has gained since.
    expect(migration).not.toMatch(/SELECT\s+[a-z]+\.\*/i);
    expect(migration).toMatch(/e\.id AS id/);
    expect(migration).toMatch(/c\.results_released_at AS class_results_released_at/);
  });

  it('states in the COMMENT that unreleased classes yield no rows', () => {
    const commentStart = migration.indexOf('COMMENT ON VIEW public.view_public_entry_results');
    expect(commentStart).toBeGreaterThanOrEqual(0);
    const comment = migration.slice(commentStart, migration.indexOf(';', commentStart));
    expect(comment).toMatch(/no rows/i);
    expect(comment).not.toMatch(/remain NULL/i);
    expect(comment).toContain('MYK9-466');
    expect(comment).toContain('MYK9-552');
  });

  it('does not touch the view grants', () => {
    expect(migration).not.toMatch(/GRANT[\s\S]{0,120}view_public_entry_results/i);
    expect(migration).not.toMatch(/REVOKE[\s\S]{0,120}view_public_entry_results/i);
  });
});
