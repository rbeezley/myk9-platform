/**
 * Applied-state replay for the anon-grant monitor (MYK9-161).
 *
 * Runs `anonGrantsCheck` twice against facts read live from the database: once
 * on the real applied state, which must pass, and once on a copy with a
 * table-level `classes` grant spliced in, which must fail. That pair is the
 * closure proof MYK9-161 asked for.
 *
 * WHY THIS EXISTS ALONGSIDE `appliedAclChecks.test.ts`, which already looks
 * like it covers this: it does not, on the table-grant dimension. That test
 * feeds `appliedAclFacts()`, whose rows are built from `AUTHENTICATED_TABLE_GRANTS`
 * (`appliedAclTestFixtures.ts`), and the checker's expectation is that same
 * constant (`appliedAclChecks.ts:219`). Both sides come from one source, so the
 * assertion cannot fail no matter what the database actually holds — it pins
 * the checker's logic, not the applied grants. Only a live probe compares the
 * code's expectation against the real ACL. This script is that probe. (The
 * fixture's `sequences` block is hand-written, so that dimension is genuine.)
 *
 * Read-only. The insecure case is constructed in memory and never written, so
 * this never puts an unsafe grant on a shared database.
 *
 * Run against staging (needs VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *
 *   set -a && . ./apps/myk9show/.env && set +a
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     scripts/qa/myk9-161-applied-acl-replay.ts
 *
 * Deliberately not wired into package.json, matching the sibling one-shot
 * evidence harnesses in `scripts/qa/db-drift/myk9-114-*.ts`. Exits non-zero if
 * the newest cron snapshot's `anon_grants` check is not `ok`.
 */
import { anonGrantsCheck } from '../../apps/myk9show/supabase/functions/_shared/anonGrantChecks.ts';

type JsonObject = Record<string, unknown>;

type SnapshotRow = {
  created_at?: unknown;
  overall_status?: unknown;
  checks?: unknown;
};

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function readJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = (await response.json()) as T | { message?: string };
  if (!response.ok) {
    const message = typeof body === 'object' && body && 'message' in body ? body.message : body;
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(message)}`);
  }
  return body as T;
}

function getAnonCheck(checks: unknown): JsonObject | null {
  if (!Array.isArray(checks)) return null;
  const check = checks.find(
    value =>
      typeof value === 'object' && value !== null && (value as JsonObject).key === 'anon_grants'
  );
  return typeof check === 'object' && check !== null ? (check as JsonObject) : null;
}

const probe = await readJson<JsonObject>('/rest/v1/rpc/system_health_probe', {
  method: 'POST',
  body: '{}',
});
const anonFacts = probe.anon_grants;
const probedAt = typeof probe.probed_at === 'string' ? probe.probed_at : new Date().toISOString();
const secureCheck = anonGrantsCheck(anonFacts, probedAt);

const insecureFacts = jsonClone(anonFacts) as JsonObject;
const insecureTables = Array.isArray(insecureFacts.tables) ? insecureFacts.tables : [];
insecureFacts.tables = [...insecureTables, { name: 'classes', kind: 'r', privs: 'r' }];
const insecureCheck = anonGrantsCheck(insecureFacts, probedAt);

const snapshots = await readJson<SnapshotRow[]>(
  '/rest/v1/system_health_snapshots?source=eq.cron-health-check&select=created_at,overall_status,checks&order=created_at.desc&limit=1'
);
const latestSnapshot = snapshots[0] ?? null;
const snapshotAnonCheck = getAnonCheck(latestSnapshot?.checks);

const secureFactsObject = anonFacts as JsonObject;
const secureTables = Array.isArray(secureFactsObject.tables) ? secureFactsObject.tables : [];
const secureColumns = Array.isArray(secureFactsObject.columns) ? secureFactsObject.columns : [];
const classesTableGrants = secureTables.filter(
  value => typeof value === 'object' && value !== null && (value as JsonObject).name === 'classes'
).length;
const classesColumnGrants = secureColumns.filter(
  value => typeof value === 'object' && value !== null && (value as JsonObject).name === 'classes'
).length;
const withheldColumns = ['num_hides', 'has_blank', 'hides_known'].filter(
  column =>
    !secureColumns.some(
      value =>
        typeof value === 'object' &&
        value !== null &&
        (value as JsonObject).name === 'classes' &&
        (value as JsonObject).column === column
    )
);

assert(secureCheck.status === 'ok', `secure applied ACL check was ${secureCheck.status}`);
assert(insecureCheck.status === 'fail', 'insecure classes table grant was not rejected');
assert(classesTableGrants === 0, 'secure applied state includes a classes table grant');
assert(classesColumnGrants > 0, 'secure applied state has no classes column grants');
assert(
  withheldColumns.length === 3,
  'secure applied state does not withhold all three hide columns'
);
console.log(
  JSON.stringify(
    {
      probe: {
        probed_at: probe.probed_at,
        latest_migration: probe.latest_migration,
        migration_count: probe.migration_count,
      },
      secure_applied: {
        status: secureCheck.status,
        detail: secureCheck.detail,
        classes_table_grants: classesTableGrants,
        classes_column_grants: classesColumnGrants,
        withheld_columns: withheldColumns,
      },
      controlled_insecure: {
        status: insecureCheck.status,
        detail: insecureCheck.detail,
      },
      latest_snapshot: {
        created_at: latestSnapshot?.created_at ?? null,
        overall_status: latestSnapshot?.overall_status ?? null,
        anon_grants: snapshotAnonCheck,
      },
    },
    null,
    2
  )
);

if (snapshotAnonCheck?.status !== 'ok') {
  process.exitCode = 1;
}
