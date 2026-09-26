/**
 * Drift check between the delete-blocking predicate in TWO places:
 *
 *   * the server guard in soft_delete_dog (SQLSTATE MK002) — the authority;
 *   * `countBlockingEntriesByDog`'s PostgREST filter, which the delete dialog
 *     uses to explain the refusal BEFORE the user clicks.
 *
 * What this can and cannot prove, stated plainly because a source-reading test
 * that oversells itself is worse than none: it CANNOT prove either predicate
 * behaves correctly — the behaviour lives in
 * `supabase/tests/soft_delete_dog_cascade_test.sql`, which runs in CI. What it
 * catches is the failure that has no other detector: someone widening or
 * narrowing the SQL guard while the dialog keeps describing the old rule, so the
 * warning silently becomes a lie and the user meets a server error the dialog
 * told them would not happen.
 *
 * The client filter is a DELIBERATE, NARROWER subset of the server guard
 * (MYK9-799): it omits `result_status` because `authenticated` has no
 * column-SELECT grant on `entries.result_status` (migration
 * 20260620001929_restrict_authenticated_entry_results.sql), and naming an
 * ungranted column inside a PostgREST `or()` filter makes PostgREST refuse the
 * whole request with 403 — which is what permanently disabled Delete for
 * every dog until this fix. `ARMS` below therefore lists only the arms both
 * sides implement; the column-allowlist test lower in this file guards
 * against the client filter ever naming an ungranted column again.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');

// The LATEST migration carrying the guard, not a hardcoded filename: the guard
// has already moved once (20260830140000 -> 20260830190000, when the armband
// half was reverted), and a pinned name would have kept reading the superseded
// copy and passing while the live definition drifted away underneath it.
const migrationsDir = resolve(repoRoot, 'supabase/migrations');
const guardMigrationName = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .reverse()
  .find(f => readFileSync(resolve(migrationsDir, f), 'utf8').includes("ERRCODE = 'MK002'"));

if (!guardMigrationName) {
  throw new Error('No migration defines the MK002 delete guard');
}

const migration = readFileSync(resolve(migrationsDir, guardMigrationName), 'utf8');
const reads = readFileSync(
  resolve(repoRoot, 'apps/myk9show/src/services/database/entries/reads.ts'),
  'utf8'
);

/** The guard body: from the MK002 EXISTS test up to its RAISE. */
function sqlGuardBody(): string {
  const start = migration.indexOf('IF EXISTS (');
  const end = migration.indexOf("USING ERRCODE = 'MK002'");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

function clientFunctionBody(): string {
  const start = reads.indexOf('export const countBlockingEntriesByDog');
  expect(start).toBeGreaterThan(-1);
  const end = reads.indexOf('\n};', start);
  expect(end).toBeGreaterThan(start);
  return reads.slice(start, end);
}

function clientFilter(): string {
  const body = clientFunctionBody();
  const or = body.indexOf('.or(');
  expect(or).toBeGreaterThan(-1);
  return body.slice(or);
}

// [sql fragment, postgrest fragment] for each arm BOTH sides implement.
// `result_status` is server-only — see the file header comment.
const ARMS: ReadonlyArray<readonly [string, string]> = [
  ["e.payment_status = 'paid'", 'payment_status.eq.paid'],
  ['e.is_scored IS TRUE', 'is_scored.is.true'],
  ['e.scoring_completed_at IS NOT NULL', 'scoring_completed_at.not.is.null'],
];

// The migration that revoked authenticated's column-SELECT grant on entries
// (20260620001929_restrict_authenticated_entry_results.sql). Mirrors the list
// pinned in authenticatedEntryResultsRlsContract.test.ts — naming any of
// these in a PostgREST filter makes PostgREST refuse the whole request.
const FORBIDDEN_AUTHENTICATED_COLUMNS = [
  'result_status',
  'search_time_seconds',
  'total_faults',
  'total_score',
  'final_placement',
  'judge_notes',
  'judge_signature',
  'disqualification_reason',
  'video_review_notes',
];

describe('delete-blocking entry predicate', () => {
  it('is the same set of client-readable arms on the server and in the dialog', () => {
    const sql = sqlGuardBody();
    const filter = clientFilter();

    for (const [sqlArm, clientArm] of ARMS) {
      expect(sql, `SQL guard is missing ${sqlArm}`).toContain(sqlArm);
      expect(filter, `client filter is missing ${clientArm}`).toContain(clientArm);
    }
  });

  it('never names a column authenticated cannot SELECT on entries (MYK9-799)', () => {
    // Assertion-first: this was red before the fix — the filter contained
    // `result_status.neq.pending`, and PostgREST 403s the ENTIRE request when
    // an `or()` filter names a column outside the caller's column grant, so
    // Delete was disabled for every dog regardless of its entries.
    const filter = clientFilter();
    for (const col of FORBIDDEN_AUTHENTICATED_COLUMNS) {
      expect(filter, `client filter names ungranted column ${col}`).not.toContain(col);
    }
  });

  it('both sides ignore tombstoned entries', () => {
    // An already-deleted entry is not a reason to refuse — without this the
    // guard would permanently block a dog whose entries were scratched.
    expect(sqlGuardBody()).toContain('e.deleted_at IS NULL');
    expect(clientFunctionBody()).toContain(".is('deleted_at', null)");
  });

  it('neither side blocks on refunded or waived entries', () => {
    // The money is not being kept, so these must stay deletable. A blanket
    // "payment_status is not null" on either side would trap both.
    const sql = sqlGuardBody();
    const filter = clientFilter();
    for (const status of ['refunded', 'waived']) {
      expect(sql, `SQL guard blocks on ${status}`).not.toContain(status);
      expect(filter, `client filter blocks on ${status}`).not.toContain(status);
    }
  });
});
