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
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');

const migration = readFileSync(
  resolve(
    repoRoot,
    'supabase/migrations/20260830140000_soft_delete_dog_releases_armband_and_waitlist.sql'
  ),
  'utf8'
);
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

// [sql fragment, postgrest fragment] for each arm of the predicate.
const ARMS: ReadonlyArray<readonly [string, string]> = [
  ["e.payment_status = 'paid'", 'payment_status.eq.paid'],
  ['e.is_scored IS TRUE', 'is_scored.is.true'],
  ['e.scoring_completed_at IS NOT NULL', 'scoring_completed_at.not.is.null'],
  ["e.result_status <> 'pending'", 'result_status.neq.pending'],
];

describe('delete-blocking entry predicate', () => {
  it('is the same set of arms on the server and in the dialog', () => {
    const sql = sqlGuardBody();
    const filter = clientFilter();

    for (const [sqlArm, clientArm] of ARMS) {
      expect(sql, `SQL guard is missing ${sqlArm}`).toContain(sqlArm);
      expect(filter, `client filter is missing ${clientArm}`).toContain(clientArm);
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
