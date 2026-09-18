/**
 * MYK9-632: the enumerated `withdrawal_reason_code` must reach the client
 * through the SAME views everything else on the Edit Entry sheet comes from.
 *
 * A source-text test proves only that someone typed the thing, so this is
 * deliberately narrow: it pins the four mechanics that are invisible in a diff
 * and fatal when wrong, and leaves "does the view actually return it" to the
 * push. Behavioural SQL under `supabase/tests/` only ever runs in CI (no
 * container runtime on the development Mac), and nothing here is a substitute
 * for `supabase db push` having been run — until it is, the column is absent
 * and every client read of it is `undefined`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260918041700_myk9_632_view_withdrawal_reason_code.sql'
  ),
  'utf8'
);

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

const innerView = sliceBetween(
  MIGRATION,
  'CREATE OR REPLACE VIEW public.view_authenticated_entry_results\n',
  'GRANT SELECT ON public.view_authenticated_entry_results TO authenticated;'
);

const wrapperView = sliceBetween(
  MIGRATION,
  'CREATE OR REPLACE VIEW public.view_authenticated_entry_results_replication\n',
  'GRANT SELECT ON public.view_authenticated_entry_results_replication TO authenticated;'
);

describe('MYK9-632 — withdrawal_reason_code on the authenticated entry views', () => {
  it('projects the column masked by can_view_admin, like its free-text sibling', () => {
    // Same predicate as `withdrawal_reason` — a show manager, or the entry's own
    // exhibitor. An unmasked projection would publish it to every reader the
    // view admits, including a ringside claim and a fellow exhibitor at the show.
    expect(innerView).toContain(
      'CASE WHEN access.can_view_admin THEN e.withdrawal_reason_code END AS withdrawal_reason_code'
    );
    expect(innerView).toContain(
      'CASE WHEN access.can_view_admin THEN e.withdrawal_reason END AS withdrawal_reason'
    );
    expect(innerView).not.toMatch(/^\s*e\.withdrawal_reason_code,?\s*$/m);
  });

  it('appends the column LAST in each select list', () => {
    // CREATE OR REPLACE VIEW may only add columns at the end. Anywhere else and
    // the migration fails on apply, which nothing in CI would catch.
    const innerSelect = innerView.slice(0, innerView.indexOf('FROM public.entries e'));
    expect(innerSelect.trimEnd().endsWith('AS withdrawal_reason_code')).toBe(true);

    const wrapperSelect = wrapperView.slice(
      0,
      wrapperView.indexOf('FROM public.view_authenticated_entry_results')
    );
    expect(wrapperSelect.trimEnd().endsWith('entries.withdrawal_reason_code')).toBe(true);
    // The four `shows` columns keep the ordinals they already hold.
    expect(wrapperSelect).toMatch(
      /shows\.deleted_at AS show_deleted_at[\s\S]*entries\.withdrawal_reason_code/
    );
  });

  it('restates security_invoker inline on BOTH views', () => {
    // CREATE OR REPLACE VIEW resets reloptions when the clause is omitted, and
    // these views are owner-run on purpose: dropping to invoker would make the
    // body run under the caller's RLS and change who sees what.
    expect(innerView).toContain('WITH (security_invoker = false)');
    expect(wrapperView).toContain('WITH (security_invoker = false)');
  });

  it('expands the replication wrapper’s star into an explicit column list', () => {
    // `entries.*` re-expands on every rebuild. Left alone it would have put
    // withdrawal_reason_code at the ordinal `show_deleted_at` holds today, and
    // CREATE OR REPLACE would have refused the rename.
    expect(wrapperView).not.toContain('entries.*');
    expect(wrapperView).toContain('  entries.id,');
    expect(wrapperView).toContain('  entries.payment_notes,');
  });

  it('re-asserts the grants and keeps anon out', () => {
    expect(MIGRATION).toContain(
      'GRANT SELECT ON public.view_authenticated_entry_results TO authenticated;'
    );
    expect(MIGRATION).toContain('REVOKE ALL ON public.view_authenticated_entry_results FROM anon;');
    // REVOKE ALL on the wrapper too: it was created under this project's
    // ALTER DEFAULT PRIVILEGES, which hands anon full CRUD on a new relation,
    // and only SELECT had ever been taken back (migration-auditor, round 2).
    expect(MIGRATION).toContain(
      'REVOKE ALL ON public.view_authenticated_entry_results_replication FROM anon;'
    );
    // The dormant write grants revoked by 20260912183000 stay revoked.
    expect(MIGRATION).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.view_authenticated_entry_results FROM authenticated;'
    );
  });
});
