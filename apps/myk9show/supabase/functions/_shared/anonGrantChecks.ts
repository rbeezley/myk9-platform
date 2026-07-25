/**
 * MYK9-93 — anon-grant drift detection against the APPLIED ACLs.
 *
 * Sibling module of `systemHealthChecks.ts` (kept separate so that file stays under the
 * repo's 500-line ceiling). Same contract as the rest of that module: pure, Deno-free so
 * it runs under the app's vitest, and tolerant — malformed input degrades to a visible
 * `fail`, never a throw, because a crashed runner writes no row at all and the board
 * would age silently into staleness.
 *
 * Why this check exists. The migration-text contract test
 * (`apps/myk9show/src/test/database/anonEntriesGrantContract.test.ts`) can only see
 * grants WRITTEN in a committed .sql file. It cannot see one arriving from an
 * ALTER DEFAULT PRIVILEGES, the dashboard, or a restore — which is exactly how
 * `dog_favorites` shipped with anon holding full CRUD despite a migration granting it
 * nothing. This reads what the database actually has, so drift from ANY source surfaces
 * on /admin/health within a day.
 *
 * Both halves matter. `public.entries` deliberately carries a column-level allowlist with
 * NO table-level SELECT: a table-only check would call a blanket re-grant healthy, which
 * is precisely the regression MYK9-93 itself shipped and had to repair.
 */

import type { SnapshotCheck } from './systemHealthChecks.ts';

/** Raw `anon_grants` fact block returned by `public.system_health_probe()`. */
export interface RawAnonGrants {
  tables?: unknown;
  columns?: unknown;
  defaults?: unknown;
}

/** One anon ACL row. `privs` is the aclitem privilege letters: r = SELECT, a = INSERT,
 * w = UPDATE, d = DELETE, D = TRUNCATE, x = REFERENCES, t = TRIGGER. */
interface AnonGrantRow {
  name: string;
  column: string | null;
  privs: string;
}

interface AnonDefaultRow {
  grantor: string;
  objtype: string;
  privs: string;
}

/**
 * Table name → the exact aclitem privilege letters anon may hold. Mirrors migrations
 * 20260725160000 / 170000 / 180000.
 *
 * `public.entries` is deliberately ABSENT: it carries a 14-column grant and must have no
 * table-level SELECT, so its presence in the probe's table list at all is a failure.
 * `dogs` and `people` are likewise column-only — those grants exist purely so anon
 * PostgREST embeds resolve to null instead of 42501; RLS admits them zero rows.
 */
export const ANON_TABLE_ALLOWLIST: Readonly<Record<string, string>> = {
  // Public reference data.
  rule_organizations: 'r',
  rule_sports: 'r',
  rulebooks: 'r',
  rules: 'r',
  sport_class_rules: 'r',
  sport_templates: 'r',
  sport_titles: 'r',
  show_templates: 'r',
  template_fields: 'r',
  user_guide: 'r',
  // Published show data, further row-filtered by RLS on show status.
  shows: 'r',
  trials: 'r',
  classes: 'r',
  armbands: 'r',
  judge_assignments: 'r',
  clubs: 'r',
  achievements: 'r',
  show_visibility_settings: 'r',
  trial_visibility_overrides: 'r',
  class_visibility_overrides: 'r',
  // The one anon write path: the pre-launch waitlist signup form. INSERT only.
  platform_waitlist: 'a',
  // The definer-rights public results release gate.
  view_public_entry_results: 'r',
};

/** Tables where anon legitimately holds COLUMN-level (never table-level) grants. */
export const ANON_COLUMN_TABLES: readonly string[] = ['entries', 'dogs', 'people'];

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Tolerant parse: a malformed row degrades to '(unknown)' with empty privs, which the
 * allowlist comparison then reports as drift rather than silently skipping it. */
function parseAnonGrant(raw: unknown): AnonGrantRow {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    name: asString(row.name, '(unknown)'),
    column: typeof row.column === 'string' ? row.column : null,
    privs: asString(row.privs),
  };
}

function parseAnonDefault(raw: unknown): AnonDefaultRow {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    grantor: asString(row.grantor, '(unknown)'),
    objtype: asString(row.objtype),
    privs: asString(row.privs),
  };
}

/** Judge the probe's `anon_grants` facts against the allowlist. */
export function anonGrantsCheck(rawFacts: unknown, probedAt: string): SnapshotCheck {
  const base = { key: 'anon_grants', label: 'Anon grants', checked_at: probedAt } as const;
  if (!rawFacts || typeof rawFacts !== 'object') {
    // Probe predates this fact (function not yet redeployed) — visible, not alarming.
    return { ...base, status: 'warn', detail: 'probe returned no anon_grants facts' };
  }

  const { tables, columns, defaults } = rawFacts as RawAnonGrants;
  const tableRows = Array.isArray(tables) ? tables.map(parseAnonGrant) : [];
  const columnRows = Array.isArray(columns) ? columns.map(parseAnonGrant) : [];
  const defaultRows = Array.isArray(defaults) ? defaults.map(parseAnonDefault) : [];

  const problems: string[] = [];

  for (const row of tableRows) {
    const expected = ANON_TABLE_ALLOWLIST[row.name];
    if (expected === undefined) {
      problems.push(`${row.name} (${row.privs}) not on the anon allowlist`);
    } else if (row.privs !== expected) {
      problems.push(`${row.name} has '${row.privs}', expected '${expected}'`);
    }
  }

  // entries must stay column-scoped. Its absence from the table list IS the invariant.
  if (tableRows.some(row => row.name === 'entries')) {
    problems.push('entries has a TABLE-level anon grant — the release-gate allowlist is bypassed');
  }

  for (const row of columnRows) {
    if (!ANON_COLUMN_TABLES.includes(row.name)) {
      problems.push(`unexpected column grant ${row.name}.${row.column ?? '?'} (${row.privs})`);
    } else if (row.privs !== 'r') {
      problems.push(`${row.name}.${row.column ?? '?'} has '${row.privs}', expected read-only`);
    }
  }

  // Any grantor other than supabase_admin means a revoked default came back.
  for (const row of defaultRows) {
    if (row.grantor !== 'supabase_admin') {
      problems.push(`default privileges for anon restored by ${row.grantor} (${row.objtype})`);
    }
  }

  if (problems.length > 0) {
    return { ...base, status: 'fail', detail: problems.join('; ') };
  }

  const writeable = tableRows.filter(row => /[awdDxt]/.test(row.privs)).length;
  return {
    ...base,
    status: 'ok',
    detail:
      `${tableRows.length} table grants (${writeable} write), ` +
      `${columnRows.length} column grants, all on the allowlist`,
  };
}
