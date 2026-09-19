/**
 * MYK9-659: the ORDER's confirmation number must reach the client through the
 * SAME views every other entry field comes from, or the offline receipt has no
 * durable reference to print and falls back to a raw enrollment UUID.
 *
 * A sibling of `movedFromEntryIdViewProjection` and
 * `withdrawalReasonCodeViewProjection`, with one deliberate difference: those
 * are hard-pinned to their own migration filename, so each stops covering the
 * views the moment a later migration redefines them — and a stale copy of a
 * view body is exactly the P0 this PR shipped and then fixed. The assertions
 * that must survive a rebuild — the column is present, and `can_view_admin`
 * still masks it — resolve the LATEST migration that defines
 * `view_authenticated_entry_results` and run against that, so they keep
 * pointing at whatever the current definition actually is.
 *
 * The ONE exception is column ORDER. `CREATE OR REPLACE VIEW` may only append,
 * so "this column is last" is a claim about the migration that appended it, not
 * about the views forever: the next migration to append a column of its own
 * would make a latest-resolved order assertion a guaranteed false red while
 * nothing was wrong. That assertion is pinned to this file's own migration.
 *
 * Behavioural SQL under `supabase/tests/` only ever runs in CI (no container
 * runtime on the development Mac), and nothing here substitutes for
 * `supabase db push` having been run — until it is, the column is absent and
 * every client read of it is `undefined`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');
const INNER_VIEW_DEF = 'CREATE OR REPLACE VIEW public.view_authenticated_entry_results\n';
const WRAPPER_VIEW_DEF =
  'CREATE OR REPLACE VIEW public.view_authenticated_entry_results_replication\n';
const OWN_MIGRATION = '20260918193700_myk9_659_view_registration_confirmation_number.sql';

/**
 * The newest migration that defines the inner view, by filename order — which
 * is the definition the database ends up with after a rebuild from migrations.
 * Resolved rather than named so the durability assertions cannot silently stop
 * covering the live shape (LESSON `replace-function-latest`).
 */
function latestViewMigration(): string {
  const candidates = readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .filter(name => readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8').includes(INNER_VIEW_DEF));
  if (candidates.length === 0) {
    throw new Error(`no migration defines ${INNER_VIEW_DEF.trim()}`);
  }
  return candidates.at(-1)!;
}

/**
 * The whole `CREATE … ;` / `COMMENT … ;` statement that begins at `start`.
 *
 * The end anchor is the statement terminator — the first `;` ending a line that
 * is not a `--` comment (the bodies carry semicolons inside comments, so the
 * first `;` in the text is not it) — falling back to the next
 * `CREATE OR REPLACE VIEW`. Deliberately NOT the GRANT that follows: anchoring
 * there made a rebuild that stops re-asserting grants throw while slicing
 * instead of failing the named grant test.
 */
function sliceStatement(source: string, start: string): string {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) {
    throw new Error(`migration does not contain ${JSON.stringify(start.trim())}`);
  }
  const rest = source.slice(startIndex);
  let offset = 0;
  for (const line of rest.split('\n')) {
    offset += line.length + 1;
    if (line.trimStart().startsWith('--')) continue;
    if (line.trimEnd().endsWith(';')) return rest.slice(0, offset);
  }
  const next = rest.indexOf('CREATE OR REPLACE VIEW', start.length);
  if (next < 0) {
    throw new Error(`no statement terminator after ${JSON.stringify(start.trim())}`);
  }
  return rest.slice(0, next);
}

describe('MYK9-659 — registration_confirmation_number on the authenticated entry views', () => {
  /** Resolved LATEST definition — what a rebuild from migrations produces. */
  let migration: string;
  let innerView: string;
  let wrapperView: string;
  /** This PR's own migration — the only place column ORDER is a claim. */
  let ownInnerView: string;
  let ownWrapperView: string;

  beforeAll(() => {
    migration = readFileSync(resolve(MIGRATIONS_DIR, latestViewMigration()), 'utf8');
    innerView = sliceStatement(migration, INNER_VIEW_DEF);
    wrapperView = sliceStatement(migration, WRAPPER_VIEW_DEF);

    const own = readFileSync(resolve(MIGRATIONS_DIR, OWN_MIGRATION), 'utf8');
    ownInnerView = sliceStatement(own, INNER_VIEW_DEF);
    ownWrapperView = sliceStatement(own, WRAPPER_VIEW_DEF);
  });

  it('is the file this PR added, not an older definition left as the latest', () => {
    // A positive control on the resolver above: if this ever fails, either a
    // later migration redefined the views without carrying the column (the
    // silent-revert failure mode), or the column was renamed.
    expect(migration).toContain('registration_confirmation_number');
  });

  it('projects the column on BOTH views', () => {
    expect(innerView).toContain('AS registration_confirmation_number');
    expect(wrapperView).toContain('entries.registration_confirmation_number');
  });

  it('masks it behind can_view_admin on the inner view', () => {
    // The ONLY guard on this column: it is a cross-table column from
    // `enrollments`, reached by an owner-run LEFT JOIN that evaluates no
    // `enrollments` policy at all. Drop the CASE and every authenticated
    // reader of the feed — judge, steward — gains the order reference.
    expect(innerView).toMatch(
      /CASE WHEN access\.can_view_admin THEN en\.confirmation_number END AS registration_confirmation_number/
    );
    // The wrapper only carries what the inner view already masked; it must not
    // re-derive the value from a join of its own.
    expect(wrapperView).not.toContain('en.confirmation_number');
  });

  it('reaches it by a LEFT JOIN on the enrollment primary key', () => {
    // LEFT so a registration-less legacy row still returns (with a NULL
    // reference) instead of dropping out of the view entirely.
    expect(innerView).toContain('LEFT JOIN public.enrollments en ON en.id = e.registration_id');
  });

  it('appends the column LAST in each select list of its own migration', () => {
    // CREATE OR REPLACE VIEW may only add columns at the end. Anywhere else and
    // the migration fails on apply, which nothing in CI would catch.
    //
    // Scoped to OWN_MIGRATION on purpose. A later migration appending a column
    // of its own is correct and expected; asserting last-ness against the
    // resolved LATEST would turn that into a false red here.
    const innerSelect = ownInnerView.slice(0, ownInnerView.indexOf('FROM public.entries e'));
    expect(innerSelect.trimEnd().endsWith('AS registration_confirmation_number')).toBe(true);
    // After MYK9-639's tail, which is the previous appended column.
    expect(innerSelect).toMatch(
      /e\.moved_from_entry_id,[\s\S]*AS registration_confirmation_number/
    );

    const wrapperSelect = ownWrapperView.slice(
      0,
      ownWrapperView.indexOf('FROM public.view_authenticated_entry_results')
    );
    expect(wrapperSelect.trimEnd().endsWith('entries.registration_confirmation_number')).toBe(true);
    expect(wrapperSelect).toMatch(
      /entries\.moved_from_entry_id,[\s\S]*entries\.registration_confirmation_number/
    );
  });

  it('restates security_invoker inline on BOTH views', () => {
    // CREATE OR REPLACE VIEW resets reloptions when the clause is omitted, and
    // these views are owner-run on purpose (20260817190000).
    expect(innerView).toContain('WITH (security_invoker = false)');
    expect(wrapperView).toContain('WITH (security_invoker = false)');
  });

  it('says in the stored COMMENT that can_view_admin is the ONLY guard', () => {
    // `pg_description` is what the next person reads off the live catalog. The
    // first draft called this column a sibling of `payment_reference`, which is
    // an `entries` column reachable under `entries` RLS too — reading that
    // comparison as a no-op argument is how the next disclosure gets written.
    const comment = sliceStatement(
      migration,
      'COMMENT ON VIEW public.view_authenticated_entry_results IS'
    );
    expect(comment).toMatch(/cross-table column from public\.enrollments/i);
    expect(comment).toMatch(/can_view_admin is its ONLY guard/i);
    expect(comment).toMatch(/enrollments_select/);
    expect(comment).not.toMatch(/exactly like (every other )?payment_reference/i);
  });

  it('keeps the new column out of anon and out of write grants', () => {
    expect(migration).toContain('REVOKE ALL ON public.view_authenticated_entry_results FROM anon;');
    expect(migration).toContain(
      'REVOKE ALL ON public.view_authenticated_entry_results_replication FROM anon;'
    );
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.view_authenticated_entry_results FROM authenticated;'
    );
  });
});
