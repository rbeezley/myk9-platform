/**
 * Drift check between the delete-blocking predicate in TWO places:
 *
 *   * the server guard in soft_delete_dog (SQLSTATE MK002) — the authority;
 *   * delete_preview's dog branch (CRUD standard Phase 2), the read the shared
 *     delete dialog makes to explain the refusal BEFORE the user clicks
 *     (count_blocking_entries_by_dog, the earlier dialog's RPC, is checked too).
 *
 * Before MYK9-822 these were two independent copies of the same condition —
 * the server's SQL guard and a client-side PostgREST `.or()` filter — and
 * this file caught them reading differently. MYK9-822 replaced the client
 * filter with a SECURITY DEFINER RPC that calls the SAME
 * `private.count_dog_blocking_entries` predicate soft_delete_dog's guard
 * calls, so the two conditions can no longer literally diverge in SQL. What
 * this file checks instead is that both callers still REACH that shared
 * predicate rather than one of them reverting to its own inline copy —
 * which would silently reopen the exact drift MYK9-822 closed, while every
 * other check (compilation, the unit test on the client wrapper) stays
 * green, because a hand-copied condition still compiles and still returns a
 * number.
 *
 * What this file CANNOT prove: that the predicate itself is correct, or that
 * the RPC's authorization actually matches soft_delete_dog's at the database
 * level (types can't see SQL semantics). That behaviour lives in
 * `supabase/tests/myk9_822_blocking_entries_rpc_test.sql`, which runs in CI.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');

// Sorted descending: migration filenames are 14-digit UTC timestamps, so the
// FIRST file containing a marker is the latest one that (re)defines it. A
// function that has moved before (soft_delete_dog has, more than once) must
// be read from wherever it lives NOW, never a hardcoded filename.
const migrationFiles = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .reverse();

function latestMigrationDefining(marker: string): string {
  const name = migrationFiles.find(f =>
    readFileSync(resolve(migrationsDir, f), 'utf8').includes(marker)
  );
  expect(name, `no migration defines: ${marker}`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, name!), 'utf8');
}

/** The body of `CREATE OR REPLACE FUNCTION <signature> ... AS <tag> ... <tag>`. */
function sqlFunctionBody(migration: string, signature: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  expect(start, `migration does not define ${signature}`).toBeGreaterThan(-1);
  // The dollar-quote tag varies ($$ vs $function$ elsewhere in this repo), so
  // read whichever one opens this function's body rather than assuming one.
  const tagMatch = /AS (\$[A-Za-z_]*\$)/.exec(migration.slice(start, start + 400));
  expect(tagMatch, `no function body delimiter found for ${signature}`).not.toBeNull();
  const tag = tagMatch![1];
  const bodyStart = migration.indexOf(tag, start) + tag.length;
  const bodyEnd = migration.indexOf(tag, bodyStart);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return migration.slice(start, bodyEnd);
}

describe('delete-blocking entry predicate (MYK9-822)', () => {
  it("soft_delete_dog's MK002 guard calls the shared private predicate", () => {
    const migration = latestMigrationDefining("USING ERRCODE = 'MK002'");
    const body = sqlFunctionBody(migration, 'public.soft_delete_dog(p_dog_id uuid)');
    expect(body).toContain('private.count_dog_blocking_entries(p_dog_id)');
    // Guards against reintroducing an inline copy of the predicate's arms —
    // exactly how the client and server drifted apart before MYK9-822.
    expect(body).not.toContain("e.payment_status = 'paid'");
  });

  it('count_blocking_entries_by_dog calls the same shared predicate', () => {
    const migration = latestMigrationDefining(
      'CREATE OR REPLACE FUNCTION public.count_blocking_entries_by_dog'
    );
    const body = sqlFunctionBody(migration, 'public.count_blocking_entries_by_dog(p_dog_id uuid)');
    expect(body).toContain('private.count_dog_blocking_entries(p_dog_id)');
  });

  it('the shared predicate ignores tombstoned entries and never blocks on refunded or waived', () => {
    const migration = latestMigrationDefining(
      'CREATE OR REPLACE FUNCTION private.count_dog_blocking_entries'
    );
    const body = sqlFunctionBody(migration, 'private.count_dog_blocking_entries(p_dog_id uuid)');
    // Tombstoned entries never block — they are already gone.
    expect(body).toContain('e.deleted_at IS NULL');
    // The money is not being kept in either case, so a blanket
    // "payment_status is not null" that traps both must never appear.
    for (const status of ['refunded', 'waived']) {
      expect(body, `predicate blocks on ${status}`).not.toContain(status);
    }
  });

  it("delete_preview's dog branch counts with the same shared predicate", () => {
    // The shared delete dialog reads delete_preview (CRUD standard Phase 2), not
    // a client filter, to say up front that a dog's delete will be refused.
    const migration = latestMigrationDefining('CREATE OR REPLACE FUNCTION public.delete_preview');
    const body = sqlFunctionBody(migration, 'public.delete_preview(p_scope text, p_id uuid)');
    const dogBranch = body.slice(
      body.indexOf("p_scope = 'dog'"),
      body.indexOf("p_scope = 'person'")
    );
    expect(dogBranch).toContain('private.count_dog_blocking_entries(p_id)');
  });
});
