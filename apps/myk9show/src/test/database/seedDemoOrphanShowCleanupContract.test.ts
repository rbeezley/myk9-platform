import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const ORPHAN_SHOW_ID = 'f3360000-0000-0000-0000-000000000001';
const ORPHAN_TITLE = '[E2E MYK9-336] Past Due Payment Fixture';
const CANONICAL_SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const seed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');
const preflightPath = join(repoRoot, 'scripts/qa/preflight-known-orphan-show.sql');
const oldCleanupPath = join(repoRoot, 'scripts/qa/cleanup-known-orphan-show.sql');

const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

const extractDeleteStatements = (sql: string, table: string): string[] => {
  if (!/^[a-z_]+$/i.test(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }

  const identifier = (name: string) => `(?:${name}|"${name}")`;
  const target = `(?:${identifier('public')}\\s*\\.\\s*)?${identifier(table)}`;
  const deleteTarget = new RegExp(
    `^\\s*DELETE\\s+FROM\\s+(?:ONLY\\s*)?(?:\\(\\s*)?${target}(?:\\s*\\)|\\s|;|$)`,
    'i'
  );
  const statements =
    sql
      .replace(/--[^\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .match(/\bDELETE\b[\s\S]*?(?:;|$)/gi) ?? [];

  return statements
    .filter(statement => deleteTarget.test(statement))
    .map(statement =>
      statement.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim()
    );
};

const expectedShowDeletes = [
  "DELETE FROM public.shows WHERE id >= 'a1090000-0000-0000-0010-000000000000'::uuid AND id < 'a1090000-0000-0000-0011-000000000000'::uuid;",
  "DELETE FROM public.shows WHERE id IN ('dededede-0000-0000-0000-000000000011','dededede-0000-0000-0000-000000000012');",
  "DELETE FROM public.shows WHERE id = 'dededede-0000-0000-0000-000000000010';",
];

const expectedEnrollmentDeletes = [
  "DELETE FROM public.enrollments WHERE id = 'dededede-0000-0000-0000-000000000070' OR (show_id = 'dededede-0000-0000-0000-000000000010' AND handler_id = (SELECT id FROM public.people WHERE lower(email)='exhibitor@myk9t.com'));",
];

describe('MYK9-615 orphan cleanup boundary', () => {
  it('pins the canonical seed delete allowlist and rejects broad mutations', () => {
    expect(extractDeleteStatements(seed, 'shows')).toEqual(expectedShowDeletes);
    expect(extractDeleteStatements(seed, 'enrollments')).toEqual(expectedEnrollmentDeletes);
    expect(seed).not.toContain(ORPHAN_SHOW_ID);

    const broadShowDelete = extractDeleteStatements(
      "DELETE FROM public.shows WHERE status = 'published';",
      'shows'
    );
    const showOnlyEnrollmentDelete = extractDeleteStatements(
      "DELETE FROM public.enrollments WHERE show_id = 'dededede-0000-0000-0000-000000000010';",
      'enrollments'
    );

    expect(expectedShowDeletes).not.toContain(broadShowDelete[0]);
    expect(expectedEnrollmentDeletes).not.toContain(showOnlyEnrollmentDelete[0]);

    const showDeleteVariants = [
      'DELETE FROM ONLY public.shows WHERE true;',
      'DELETE FROM ONLY(public.shows) WHERE true;',
      'DELETE/* comment */FROM public.shows WHERE true;',
      'DELETE FROM shows WHERE true;',
      'DELETE FROM ONLY ("public"."shows") WHERE true;',
      'DELETE FROM "public".shows WHERE true;',
      'DELETE FROM public."shows" WHERE true;',
      'DELETE FROM ONLY "shows" WHERE true;',
    ];
    const enrollmentDeleteVariants = [
      'DELETE FROM ONLY public.enrollments WHERE true;',
      'DELETE FROM ONLY(public.enrollments) WHERE true;',
      'DELETE/* comment */FROM public.enrollments WHERE true;',
      'DELETE FROM enrollments WHERE true;',
      'DELETE FROM ONLY ("public"."enrollments") WHERE true;',
      'DELETE FROM "public".enrollments WHERE true;',
      'DELETE FROM public."enrollments" WHERE true;',
      'DELETE FROM ONLY "enrollments" WHERE true;',
    ];

    for (const mutation of showDeleteVariants) {
      expect(extractDeleteStatements(`${seed}\n${mutation}`, 'shows')).not.toEqual(
        expectedShowDeletes
      );
    }
    for (const mutation of enrollmentDeleteVariants) {
      expect(extractDeleteStatements(`${seed}\n${mutation}`, 'enrollments')).not.toEqual(
        expectedEnrollmentDeletes
      );
    }
  });

  it('keeps the canonical seed free of the observed orphan and broad show deletion', () => {
    expect(seed).not.toContain(ORPHAN_SHOW_ID);
    expect(seed).not.toContain(ORPHAN_TITLE);
    expect(stripSqlComments(seed)).not.toContain(
      `DELETE FROM public.shows WHERE id = '${ORPHAN_SHOW_ID}'`
    );
    expect(seed).toContain(`DELETE FROM public.shows WHERE id = '${CANONICAL_SHOW_ID}'`);
  });

  it('replaces the executable cleanup file with a read-only exact-ID preflight', () => {
    expect(existsSync(oldCleanupPath)).toBe(false);
    expect(existsSync(preflightPath)).toBe(true);

    const preflight = readFileSync(preflightPath, 'utf8');
    const withoutComments = stripSqlComments(preflight);
    expect(withoutComments.trimStart()).toMatch(/^BEGIN TRANSACTION READ ONLY;/);
    expect(withoutComments.trimEnd()).toMatch(/ROLLBACK;\s*$/);
    expect(withoutComments).not.toMatch(/\b(?:DELETE|COMMIT)\b/i);
    expect(withoutComments).not.toMatch(
      /\b(?:INSERT|UPDATE|TRUNCATE|CREATE|ALTER|DROP|CALL|DO)\b/i
    );
    expect(withoutComments).not.toMatch(/SELECT\s+public\.hard_delete_show\s*\(/i);
    expect(preflight).toContain(ORPHAN_SHOW_ID);
    expect(preflight).toContain(ORPHAN_TITLE);
    expect(withoutComments).toContain('public.entries');
    expect(withoutComments).toContain('public.enrollments');
    expect(withoutComments).toContain('public.result_submissions');
    expect(withoutComments).toContain('public.activity_log');
    expect(withoutComments).toContain('catalog_manifest_status');
    expect(withoutComments).toContain('public.trial_packet_snapshots');
    expect(withoutComments).toContain('public.stripe_orders');
    expect(withoutComments).toContain('public.entry_payment_links');
    expect(withoutComments).toContain('pg_catalog.pg_constraint');
    expect(withoutComments).toContain('\\gexec');
    expect(withoutComments).toContain('cardinality(fk.conkey)');
    expect(withoutComments).toContain("'RETAINED (default)'");
    expect(withoutComments).toContain("'DISPOSABLE (reviewed structure)'");
    expect(withoutComments).toContain('fk.confdeltype');
    expect(withoutComments).not.toContain('EDGE COUNT MATCHES REVIEWED MANIFEST');
    expect(withoutComments).toContain('pg_catalog.pg_get_functiondef');
    expect(withoutComments).toContain("'$manifest$'");
    expect(withoutComments).toContain('jsonb_array_elements');
    expect(withoutComments).toContain('missing_edges');
    expect(withoutComments).toContain('missing_edge_details');
    expect(withoutComments).toContain('added_or_changed_edges');
    expect(withoutComments).toContain('added_or_changed_edge_details');
    expect(withoutComments).toContain('referencing_rows');
    expect(withoutComments).toContain('MATCHED TO CURRENT RPC MANIFEST');
    expect(withoutComments).toContain('UNCLASSIFIED / CHANGED');
    expect(withoutComments).toContain('UNCLASSIFIED COMPOSITE FK');
    expect(withoutComments).toContain('STOP: UNRECOGNIZED RPC DISPOSITION');
    expect(withoutComments).toContain('EXACT MATCH TO CURRENT RPC MANIFEST');
    expect(withoutComments).toContain('expected.disposition');
    expect(withoutComments).toContain('reviewed_disposable');
    expect(withoutComments).toContain("'trials_show_id_fkey'");
    expect(withoutComments).toContain("'classes_trial_id_fkey'");
    expect(withoutComments).toContain('FROM live_edges live');
    expect(withoutComments).toContain("parent.relname IN ('shows', 'trials', 'classes')");
    expect(withoutComments).toContain('WHERE child.%I IN (%s)');
    expect(withoutComments).toContain('WHERE p.id = %L::uuid');
    expect(withoutComments).toContain('WHERE p.show_id = %L::uuid');
    expect(withoutComments).toContain('WHERE t.show_id = %L::uuid');
    expect(withoutComments.match(/'SELECT %L::text AS constraint_name/g) ?? []).toHaveLength(2);
    expect(withoutComments.match(/f3360000-0000-0000-0000-000000000001/g)?.length).toBeGreaterThan(
      1
    );
    expect(withoutComments).not.toContain("VALUES ('shows', 39)");
  });

  it('documents the existing Show Details action as the separately approved mutation path', () => {
    const runbook = readFileSync(
      join(repoRoot, 'docs/operations/known-orphan-show-cleanup.md'),
      'utf8'
    );
    expect(runbook).toContain('preflight-known-orphan-show.sql');
    expect(runbook).toContain('Show Details');
    expect(runbook).toContain('site-admin');
    expect(runbook).toContain('separate approval');
    expect(runbook).not.toContain('confirm_cleanup');
    expect(runbook).not.toContain('hard_delete_show(');
    expect(runbook).not.toContain('cleanup-known-orphan-show.sql');
  });
});
