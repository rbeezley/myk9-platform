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
 * evidence harnesses in `scripts/qa/db-drift/myk9-114-*.ts`.
 *
 * Exits non-zero on any of three distinct conditions, reported separately: no
 * `anon_grants` check present in recent snapshots (a monitoring gap), a check
 * older than its own declared `stale_after_ms` (evidence we should not pass
 * on), or a check that is present, fresh, and not `ok` (a real regression).
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

// Do NOT judge the newest row alone. `cron-health-check` runs in continuous
// mode every ~5 minutes and carries the last deep result forward rather than
// re-running it, so consecutive rows repeat one `anon_grants` check: 12 rows
// spanning 55 minutes were observed all reporting the same `checked_at`. Two
// ways that breaks a naive read of row 0 — a mode that omits the deep check
// altogether reads as a failure on a healthy ACL, and a genuinely old carried
// result reads as a pass. So scan back for the newest row that actually
// carries the check, then judge it on its own declared freshness window.
const snapshots = await readJson<SnapshotRow[]>(
  '/rest/v1/system_health_snapshots?source=eq.cron-health-check&select=created_at,overall_status,checks&order=created_at.desc&limit=50'
);
const latestSnapshot = snapshots[0] ?? null;
const carrier = snapshots.find(row => getAnonCheck(row.checks) !== null) ?? null;
const snapshotAnonCheck = getAnonCheck(carrier?.checks);

const checkedAt =
  typeof snapshotAnonCheck?.checked_at === 'string' ? snapshotAnonCheck.checked_at : null;
const staleAfterMs =
  typeof snapshotAnonCheck?.stale_after_ms === 'number' ? snapshotAnonCheck.stale_after_ms : null;
const checkAgeMs = checkedAt ? Date.now() - Date.parse(checkedAt) : null;
// The check declares its own window; honour that rather than inventing one.
const isStale = checkAgeMs !== null && staleAfterMs !== null && checkAgeMs > staleAfterMs;

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
      },
      // Reported separately from latest_snapshot because they are usually not
      // the same row: continuous mode carries the deep result forward, so the
      // row that CARRIES the check is often older than the newest row, and the
      // check inside it older still.
      anon_grants_evidence: {
        carried_by_snapshot: carrier?.created_at ?? null,
        checked_at: checkedAt,
        check_age_ms: checkAgeMs,
        stale_after_ms: staleAfterMs,
        is_stale: isStale,
        check: snapshotAnonCheck,
      },
    },
    null,
    2
  )
);

// Fail loudly and distinguishably: a missing deep check is a monitoring gap, a
// stale one is evidence we must not pass on, and neither is the same as a real
// ACL regression. Silence on any of them would let this report a green that
// nothing actually verified.
if (!snapshotAnonCheck) {
  console.error(
    `no anon_grants check found in the newest ${snapshots.length} cron-health-check snapshots`
  );
  process.exitCode = 1;
} else if (isStale) {
  console.error(
    `anon_grants check is stale: ${checkAgeMs}ms old, window is ${staleAfterMs}ms (checked_at ${checkedAt})`
  );
  process.exitCode = 1;
} else if (snapshotAnonCheck.status !== 'ok') {
  process.exitCode = 1;
}
