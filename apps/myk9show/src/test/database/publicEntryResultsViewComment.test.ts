import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract for migration 20260916234500 — MYK9-552.
 *
 * `view_public_entry_results` is owner-run (`security_invoker = false`), so its
 * body is the ONLY guard anon meets (LESSONS `#view-predicate-audit`). Migration
 * 20260913131500 added `c.results_released_at IS NOT NULL` to the top-level
 * WHERE, which made every per-column arm testing that same column unreachable
 * while the COMMENT still described the old NULL-the-columns behaviour. This
 * migration removes the dead arms and rewrites the COMMENT; these assertions pin
 * the properties a future edit must not lose.
 *
 * Every assertion is sliced to the `CREATE OR REPLACE VIEW … ;` span, never the
 * whole file: header prose that merely NAMES a pattern must not be able to
 * satisfy or trip a check (LESSONS `#comment-satisfies-grep`).
 */
const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260916234500_view_public_entry_results_comment.sql'
);
const migration = readFileSync(migrationPath, 'utf8');

/** The `CREATE OR REPLACE VIEW …;` statement, with SQL line comments stripped. */
function viewStatement(): string {
  const start = migration.indexOf('CREATE OR REPLACE VIEW public.view_public_entry_results');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(';', start);
  expect(end).toBeGreaterThan(start);
  return migration
    .slice(start, end + 1)
    .split('\n')
    .map(line => line.replace(/--.*$/, ''))
    .join('\n');
}

/** The SELECT list: everything between the view's `SELECT` and its `FROM`. */
function selectList(): string {
  const stmt = viewStatement();
  const selectIndex = stmt.indexOf('SELECT');
  const fromIndex = stmt.indexOf('\n   FROM public.entries e');
  expect(selectIndex).toBeGreaterThanOrEqual(0);
  expect(fromIndex).toBeGreaterThan(selectIndex);
  return stmt.slice(selectIndex + 'SELECT'.length, fromIndex);
}

/** The top-level WHERE clause of the view statement. */
function whereClause(): string {
  const stmt = viewStatement();
  const whereIndex = stmt.indexOf('\n  WHERE ');
  expect(whereIndex).toBeGreaterThan(0);
  return stmt.slice(whereIndex);
}

/**
 * The exact ordered output columns of the view.
 *
 * CREATE OR REPLACE VIEW permits APPENDING columns, so without this list a later
 * edit could bolt `e.judge_notes` onto an owner-run view that anon reads and
 * every other assertion here would stay green.
 */
const EXPECTED_COLUMNS = [
  'id',
  'class_id',
  'trial_id',
  'show_id',
  'dog_id',
  'armband',
  'handler',
  'run_order',
  'is_in_ring',
  'is_scored',
  'check_in_status',
  'entry_status',
  'scoring_completed_at',
  'created_at',
  'final_placement',
  'result_status',
  'search_time_seconds',
  'total_score',
  'total_faults',
  'result_text',
  'dog_name',
  'dog_call_name',
  'dog_breed',
  'dog_image_url',
  'class_name',
  'class_level',
  'class_element',
  'class_results_released_at',
];

/**
 * Output names in order. Every projection either ends `AS <name>` or is a bare
 * `<alias>.<column>` reference whose name is the column — splitting on the
 * top-level commas (depth 0 w.r.t. parentheses) keeps CASE arms and the LATERAL
 * subquery from being mistaken for separate projections.
 */
function outputColumnNames(): string[] {
  const list = selectList();
  const projections: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      projections.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  projections.push(current);

  return projections.map(projection => {
    const collapsed = projection.replace(/\s+/g, ' ').trim();
    const aliased = / AS ([a-z_][a-z0-9_]*)$/i.exec(collapsed);
    if (aliased) return aliased[1];
    const bare = /^[a-z]+\.([a-z_][a-z0-9_]*)$/i.exec(collapsed);
    expect(bare, `projection has no derivable output name: ${collapsed}`).not.toBeNull();
    return bare![1];
  });
}

describe('view_public_entry_results comment/body reconciliation (MYK9-552)', () => {
  it('replaces the view in place, never dropping it (a DROP resets the ACL)', () => {
    expect(migration).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.view_public_entry_results/i);
    expect(migration).not.toMatch(/DROP\s+VIEW[\s\S]*view_public_entry_results/i);
  });

  it('carries the inline security_invoker = false on the replace', () => {
    // LESSONS `#replace-view-reloptions`: CREATE OR REPLACE VIEW resets
    // reloptions, so without the inline WITH the view silently becomes
    // invoker-run and skips the owner-run gate entirely.
    expect(viewStatement()).toMatch(
      /^CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.view_public_entry_results\s*\n?\s*WITH\s*\(\s*security_invoker\s*=\s*false\s*\)/i
    );
  });

  it('keeps the released-results predicate in the top-level WHERE', () => {
    const where = whereClause();
    expect(where).toContain('c.results_released_at IS NOT NULL');
    expect(where).toContain('e.deleted_at IS NULL');
    expect(where).toContain('c.deleted_at IS NULL');
    expect(where).toContain('sh.deleted_at IS NULL');
  });

  it('references results_released_at only in the WHERE and the published column', () => {
    // The dead guards took the shape `WHEN vis.<x>_visible AND
    // c.results_released_at IS NOT NULL THEN …`, so an assertion anchored on
    // `CASE WHEN c.results_released_at` misses a reintroduction inside a
    // vis.*_visible or a result_text arm. Counting occurrences catches every
    // shape. Exactly two are legitimate: the WHERE predicate, and the
    // class_results_released_at projection that publishes the timestamp itself.
    expect(viewStatement().match(/c\.results_released_at/g) ?? []).toHaveLength(2);
    expect(whereClause().match(/c\.results_released_at/g) ?? []).toHaveLength(1);

    // Remove the one legitimate projection; nothing may reference the column in
    // what is left of the SELECT list.
    const PUBLISHED = 'c.results_released_at AS class_results_released_at';
    const list = selectList();
    expect(list).toContain(PUBLISHED);
    expect(list.replace(PUBLISHED, '')).not.toContain('results_released_at');
  });

  it('keeps the still-reachable per-field visibility guards', () => {
    const list = selectList();
    expect(list).toMatch(/CASE\s+WHEN\s+vis\.placement_visible\s+THEN\s+e\.final_placement/i);
    expect(list).toMatch(/CASE\s+WHEN\s+vis\.qualification_visible\s+THEN\s+e\.result_status/i);
    expect(list).toMatch(/WHEN\s+vis\.time_visible\s+THEN\s+e\.search_time_seconds/i);
    expect(list).toMatch(/WHEN\s+vis\.faults_visible\s+THEN\s+e\.total_faults/i);
  });

  it('publishes exactly the 28 expected columns, in order', () => {
    expect(outputColumnNames()).toEqual(EXPECTED_COLUMNS);
  });

  it('keeps an explicit column list rather than SELECT e.*', () => {
    // LESSONS `#select-star-reexpands`: a star re-expands on every rebuild and
    // publishes whatever columns the base table has gained since.
    expect(selectList()).not.toMatch(/[a-z]+\.\*/i);
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

  it('contains no GRANT or REVOKE statement at all', () => {
    // Statement text only — a proximity regex over the raw file both misses a
    // distant GRANT and trips on prose. Strip line comments, then look for the
    // keywords as statement starters anywhere in the remaining SQL.
    const sql = migration
      .split('\n')
      .map(line => line.replace(/--.*$/, ''))
      .join('\n');
    expect(sql).not.toMatch(/\b(GRANT|REVOKE)\b/i);
  });
});
