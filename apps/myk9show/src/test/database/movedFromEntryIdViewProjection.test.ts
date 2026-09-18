/**
 * MYK9-639: the move-up supersession link must reach the client through the SAME
 * views every other entry field comes from, or the reverse move (MYK9-640) has
 * nothing durable to read.
 *
 * Deliberately narrow, and a sibling of withdrawalReasonCodeViewProjection: it
 * pins the mechanics that are invisible in a diff and fatal when wrong, and
 * leaves "does the view actually return it" to the push. Behavioural SQL under
 * `supabase/tests/` only ever runs in CI (no container runtime on the
 * development Mac), and nothing here substitutes for `supabase db push` having
 * been run — until it is, the column is absent, every client read of it is
 * `undefined`, and the reverse move falls back to the move-up note.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260918193300_myk9_639_move_up_supersession.sql'
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

describe('MYK9-639 — moved_from_entry_id on the authenticated entry views', () => {
  it('adds the column with ON DELETE SET NULL, never CASCADE', () => {
    // CASCADE would let a hard-deleted source take the LIVE destination entry
    // with it — the dog would lose the run they were moved into.
    expect(MIGRATION).toMatch(
      /ADD COLUMN IF NOT EXISTS moved_from_entry_id uuid\s*\n?\s*REFERENCES public\.entries\(id\) ON DELETE SET NULL/
    );
    expect(MIGRATION).not.toContain('ON DELETE CASCADE');
  });

  it('grants the new column to authenticated and states anon out', () => {
    // `public.entries` has no table-level SELECT for authenticated (relacl reads
    // `authenticated=awd`), so a column nobody names is a PostgREST 42501.
    expect(MIGRATION).toContain(
      'GRANT SELECT (moved_from_entry_id) ON public.entries TO authenticated;'
    );
    expect(MIGRATION).toContain('REVOKE ALL (moved_from_entry_id) ON public.entries FROM anon;');
  });

  it('carries an FK-leading index so the reverse-move lookup and SET NULL are indexed', () => {
    expect(MIGRATION).toMatch(
      /CREATE INDEX IF NOT EXISTS entries_moved_from_entry_id_fk_idx\s*\n?\s*ON public\.entries \(moved_from_entry_id\)/
    );
  });

  it('projects the column unmasked — it is structural provenance, not money', () => {
    expect(innerView).toMatch(/^\s*e\.moved_from_entry_id\s*$/m);
    expect(innerView).not.toContain('THEN e.moved_from_entry_id END');
  });

  it('appends the column LAST in each select list', () => {
    // CREATE OR REPLACE VIEW may only add columns at the end. Anywhere else and
    // the migration fails on apply, which nothing in CI would catch.
    const innerSelect = innerView.slice(0, innerView.indexOf('FROM public.entries e'));
    expect(innerSelect.trimEnd().endsWith('e.moved_from_entry_id')).toBe(true);
    // It goes AFTER the previous tail, which MYK9-632 put there.
    expect(innerSelect).toMatch(/AS withdrawal_reason_code,[\s\S]*e\.moved_from_entry_id/);

    const wrapperSelect = wrapperView.slice(
      0,
      wrapperView.indexOf('FROM public.view_authenticated_entry_results')
    );
    expect(wrapperSelect.trimEnd().endsWith('entries.moved_from_entry_id')).toBe(true);
    expect(wrapperSelect).toMatch(
      /shows\.deleted_at AS show_deleted_at[\s\S]*entries\.withdrawal_reason_code,[\s\S]*entries\.moved_from_entry_id/
    );
  });

  it('restates security_invoker inline on BOTH views', () => {
    // CREATE OR REPLACE VIEW resets reloptions when the clause is omitted, and
    // these views are owner-run on purpose.
    expect(innerView).toContain('WITH (security_invoker = false)');
    expect(wrapperView).toContain('WITH (security_invoker = false)');
  });

  it('keeps the replication wrapper’s select list explicit', () => {
    expect(wrapperView).not.toContain('entries.*');
    expect(wrapperView).toContain('  entries.id,');
    expect(wrapperView).toContain('  entries.withdrawal_reason_code,');
  });

  it('re-asserts the view grants and keeps anon out', () => {
    expect(MIGRATION).toContain(
      'GRANT SELECT ON public.view_authenticated_entry_results TO authenticated;'
    );
    expect(MIGRATION).toContain('REVOKE ALL ON public.view_authenticated_entry_results FROM anon;');
    expect(MIGRATION).toContain(
      'REVOKE ALL ON public.view_authenticated_entry_results_replication FROM anon;'
    );
    expect(MIGRATION).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.view_authenticated_entry_results FROM authenticated;'
    );
  });
});
