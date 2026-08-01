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
 * Both halves matter. `public.entries` and `public.classes` deliberately carry column-level
 * allowlists with NO table-level SELECT: a table-only check would call a blanket re-grant
 * healthy, which is precisely the regression MYK9-93 itself shipped and had to repair.
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
 * 20260725160000 / 170000 / 180000, 20260730140000 and 20260730220000.
 *
 * Every key of ANON_COLUMN_ALLOWLIST is deliberately ABSENT here: those tables carry
 * column grants and must have no table-level SELECT, so their presence in the probe's
 * table list at all is a failure (enforced below over ANON_COLUMN_TABLES).
 * `entries` is the public-results release gate and `classes` withholds the scent-work
 * hide counts (MYK9-116); `dogs`, `people`, and `judge_assignments` are column-only so
 * anon PostgREST embeds resolve to null instead of 42501, with RLS admitting them zero rows.
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
  user_guide: 'r',
  // Published show data, further row-filtered by RLS on show status.
  shows: 'r',
  trials: 'r',
  armbands: 'r',
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

/**
 * Exact table → column allowlist for anon's column-level grants.
 *
 * These are intentionally copied from migrations 20260725170000, 20260725180000 and
 * 20260730140000, all restated verbatim in 20260730220000. A table name alone is not
 * enough: adding a sensitive column to one of these tables must make the health check
 * fail just as adding a new table would.
 */
export const ANON_COLUMN_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  // Every classes column EXCEPT num_hides, has_blank and hides_known — the scent-work
  // hide secrets a competitor must not learn before running the class (MYK9-116).
  // Their absence from this list is the invariant; a new column added to the table is
  // NOT auto-granted to anon, so drift here means someone granted it deliberately.
  classes: [
    'id',
    'trial_id',
    'name',
    'description',
    'level',
    'element',
    'section',
    'competition_type',
    'entry_fee',
    'max_entries',
    'allow_waitlist',
    'max_dogs_per_handler',
    'breed_restrictions',
    'jump_heights',
    'age_min',
    'age_max',
    'height_min',
    'height_max',
    'handler_age_min',
    'handler_age_max',
    'start_time',
    'estimated_duration',
    'actual_start_time',
    'actual_end_time',
    'status',
    'time_limit_seconds',
    'num_areas',
    'max_faults',
    'qualifying_threshold',
    'is_scoring_finalized',
    'results_released_at',
    'dogs_ahead_notification_count',
    'total_entries_count',
    'checked_in_count',
    'scored_count',
    'created_at',
    'updated_at',
    'deleted_at',
    'deleted_by',
    'class_number',
    'timer_mode',
    'distraction_count',
    'is_results_reviewed',
    'judge_name',
    'time_limit_area2_seconds',
    'time_limit_area3_seconds',
    'display_order',
    'results_released_by',
    'version',
    'status_source',
    'reopened_after_closeout_at',
    'revised_expected_start',
  ],
  entries: [
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
    'jump_height',
    'created_at',
  ],
  judge_assignments: [
    'id',
    'person_id',
    'show_id',
    'trial_id',
    'class_id',
    'status',
    'invited_at',
    'confirmed_at',
    'created_at',
    'updated_at',
  ],
  dogs: ['id', 'name', 'call_name', 'breed', 'image_url'],
  people: ['id', 'first_name', 'last_name', 'email'],
};

/** Tables where anon legitimately holds COLUMN-level (never table-level) grants. */
export const ANON_COLUMN_TABLES: readonly string[] = Object.keys(ANON_COLUMN_ALLOWLIST);

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

  const seenTables = new Set<string>();
  for (const row of tableRows) {
    if (ANON_TABLE_ALLOWLIST[row.name] === undefined) continue;
    if (seenTables.has(row.name)) {
      problems.push(`duplicate anon table grant ${row.name}`);
    }
    seenTables.add(row.name);
  }
  for (const [name, privs] of Object.entries(ANON_TABLE_ALLOWLIST)) {
    if (!seenTables.has(name)) {
      problems.push(`missing anon table grant ${name} (${privs})`);
    }
  }

  // The column-allowlist tables must stay column-scoped. Their absence from the table
  // list IS the invariant: Postgres cannot subtract a column from a table-wide grant, so
  // any table-level SELECT here hands anon the withheld columns back wholesale.
  for (const name of ANON_COLUMN_TABLES) {
    if (tableRows.some(row => row.name === name)) {
      problems.push(`${name} has a TABLE-level anon grant — the column allowlist is bypassed`);
    }
  }

  const seenColumns = new Set<string>();
  for (const row of columnRows) {
    const column = row.column ?? '?';
    const key = `${row.name}.${column}`;
    const expectedColumns = ANON_COLUMN_ALLOWLIST[row.name];
    if (!expectedColumns?.includes(column)) {
      problems.push(`unexpected column grant ${key} (${row.privs})`);
    } else if (row.privs !== 'r') {
      problems.push(`${key} has '${row.privs}', expected read-only`);
    } else if (seenColumns.has(key)) {
      problems.push(`duplicate anon column grant ${key}`);
    }
    seenColumns.add(key);
  }
  for (const [name, columns] of Object.entries(ANON_COLUMN_ALLOWLIST)) {
    for (const column of columns) {
      if (!seenColumns.has(`${name}.${column}`)) {
        problems.push(`missing anon column grant ${name}.${column} (r)`);
      }
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
