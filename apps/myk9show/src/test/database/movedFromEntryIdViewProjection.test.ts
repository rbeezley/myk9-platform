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

const moveUpFn = sliceBetween(
  MIGRATION,
  'CREATE OR REPLACE FUNCTION public.move_up_entry(',
  'REVOKE ALL ON FUNCTION public.move_up_entry'
);

const reverseFn = sliceBetween(
  MIGRATION,
  'CREATE OR REPLACE FUNCTION public.reverse_move_up_entry(',
  'REVOKE ALL ON FUNCTION public.reverse_move_up_entry'
);

/**
 * The INSERT column list inside `move_up_entry`, as written. Parsed rather than
 * grepped so "the word does not appear" cannot be satisfied by a comment.
 */
const insertColumns = (() => {
  const start = moveUpFn.indexOf('INSERT INTO public.entries (');
  expect(start).toBeGreaterThanOrEqual(0);
  const open = moveUpFn.indexOf('(', start);
  const close = moveUpFn.indexOf(')', open);
  return moveUpFn
    .slice(open + 1, close)
    .split(',')
    .map(column => column.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);
})();

describe('MYK9-639 — move_up_entry / reverse_move_up_entry', () => {
  it('inserts the destination with NO money column at all', () => {
    // This is the assertion that keeps a Stripe-paid dog moveable.
    // `payment_method = 'online'` together with `payment_status = 'paid'` on an
    // INSERT is exactly what `trg_entries_protect_payment_fields_insert` raises
    // 42501 on, so carrying the source's payment forward made every online-paid
    // entry fail to move at all. Nine such rows exist live today.
    for (const forbidden of [
      'payment_method',
      'payment_reference',
      'payment_received_on',
      'payment_notes',
      'stripe_payment_intent_id',
      'comped',
      'comped_reason',
      'discount_amount',
      'refund_amount',
      'refund_notes',
      'refunded_at',
      'promo_code_id',
    ]) {
      expect(insertColumns).not.toContain(forbidden);
    }
    // The two money columns it DOES set, to neutral values.
    expect(insertColumns).toContain('payment_status');
    expect(insertColumns).toContain('entry_fee');
    expect(moveUpFn).toMatch(/'pending',\s*0,/);
  });

  it('carries the dog\u2019s PROVENANCE, not their money (round 3)', () => {
    // `entry_source` is the only field that proves a registry collected the fee
    // ('ukc_online'), `is_day_of_show` is the day-of/pre-entry split, and
    // `registration_id` is what keeps the run on the exhibitor's order card.
    // All three are per-BUCKET lines on the registry report, so losing them
    // bills the club for a run UKC already collected.
    for (const carried of ['is_day_of_show', 'entry_source', 'registration_id']) {
      expect(insertColumns).toContain(carried);
    }
    expect(moveUpFn).toContain(
      'v_source.is_day_of_show, v_source.entry_source, v_source.registration_id'
    );
  });

  it('carries the APPROVAL state rather than promoting to confirmed (round 3)', () => {
    // Writing 'confirmed' unconditionally accepted an entry the secretary never
    // had — a `pending-payment` or `submitted` source landed approved — and the
    // reverse then restored it as 'confirmed' too, because it restores from the
    // destination.
    expect(moveUpFn).toContain('v_source.entry_status,');
    expect(moveUpFn).not.toMatch(/VALUES[\s\S]*\n\s*'confirmed',/);
  });

  it('refuses a duplicate class entry in WORDS, before the unique index speaks', () => {
    expect(moveUpFn).toContain("RAISE EXCEPTION 'This dog is already entered in that class.'");
    expect(moveUpFn).toMatch(
      /SELECT 1\s*\n\s*FROM public\.entries e\s*\n\s*WHERE e\.dog_id = v_source\.dog_id/
    );
  });

  it('carries the check-in ONLY as a check-in', () => {
    // 'pulled' cannot reach the insert (the source is refused), and 'in-ring' /
    // 'at-gate' / 'completed' describe a run in the class being left. Carrying
    // 'pulled' would have dropped the dog out of the destination class's
    // expected count and run order entirely.
    expect(moveUpFn).toContain(
      "CASE WHEN v_source.check_in_status = 'checked-in' THEN 'checked-in' ELSE 'no-status' END"
    );
  });

  it('refuses a source that is not movable', () => {
    expect(moveUpFn).toMatch(
      /IN\s*\n?\s*\('moved', 'withdrawn', 'scratched', 'absent', 'not_accepted'\)/
    );
    expect(moveUpFn).toContain("v_source.check_in_status = 'pulled'");
    expect(moveUpFn).toContain('v_source.deleted_at IS NOT NULL');
  });

  it('writes the destination note in the shape the TypeScript parser reads', () => {
    // `parseMovedUpFromClassId` matches /Moved up from class ([^\s:]+)/, and the
    // reversal's legacy-pair recognition depends on it. SQL and TS are two
    // languages authoring one template, so the shape is pinned here.
    expect(moveUpFn).toContain("'Moved up from class ' || v_source.class_id::text");
    expect(moveUpFn).toContain("COALESCE(': ' || NULLIF(btrim(p_reason), ''), '')");
  });

  it('does not overwrite the source special_requests', () => {
    // The FK is the lineage; that column is where a secretary writes "reactive
    // dog, needs the ramp", and the durable reverse used to null it.
    expect(moveUpFn).toMatch(/UPDATE public\.entries\s*\n\s*SET entry_status = 'moved'\s*\n/);
    expect(moveUpFn).not.toMatch(/SET[\s\S]*special_requests\s*=/);
  });

  it('refuses a reverse once the run has STARTED, not merely once it has a result', () => {
    for (const started of [
      'v_dest.is_scored',
      'v_dest.is_in_ring',
      'v_dest.scoring_started_at IS NOT NULL',
      'v_dest.ring_entry_time IS NOT NULL',
      'v_dest.final_placement IS NOT NULL',
      'v_dest.points_earned',
      'v_dest.search_time_seconds',
      'v_dest.area1_time_seconds',
      'v_dest.area4_time_seconds',
      // Round 3: the list read as exhaustive and was not.
      'v_dest.total_incorrect_finds',
      'v_dest.no_finish_count',
      'v_dest.points_possible',
      'v_dest.total_faults',
      'v_dest.total_correct_finds',
      'v_dest.total_score',
      'v_dest.scoring_completed_at',
    ]) {
      expect(reverseFn).toContain(started);
    }
    expect(reverseFn).toContain("COALESCE(v_dest.result_status, 'pending') <> 'pending'");
  });

  it('authorizes the SOURCE show too, not just the destination (round 2)', () => {
    // The reverse writes TWO rows, and DEFINER is owned by `postgres`, which
    // bypasses RLS — so authorizing only the destination left the source UPDATE
    // checked by nothing. `entries` grants `authenticated` table-wide UPDATE and
    // no trigger guards `moved_from_entry_id`, so a secretary could point one of
    // their own entries at a `moved` entry in a show they do not manage and have
    // this function flip it live.
    expect(reverseFn).toContain('v_source.show_id IS DISTINCT FROM v_dest.show_id');
    expect(reverseFn).toContain('NOT public.can_manage_show(v_source.show_id)');
  });

  it('restates the table policy predicate, because DEFINER turns RLS off', () => {
    expect(moveUpFn).toContain('IF NOT public.can_manage_show(v_source.show_id) THEN');
    expect(reverseFn).toContain('IF NOT public.can_manage_show(v_dest.show_id) THEN');
    for (const fn of [moveUpFn, reverseFn]) {
      expect(fn).toContain('SECURITY DEFINER');
      expect(fn).toContain("SET search_path TO ''");
    }
  });

  it('keeps EXECUTE away from PUBLIC and anon', () => {
    for (const signature of [
      'public.move_up_entry(uuid, uuid, uuid, text)',
      'public.reverse_move_up_entry(uuid)',
    ]) {
      expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
      expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon;`);
      expect(MIGRATION).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated;`);
    }
  });
});

describe('MYK9-639 — moved_from_entry_id on the authenticated entry views', () => {
  it('describes the MONEY-NEUTRAL design in the header and the stored COMMENT', () => {
    // The COMMENT lands in `pg_description` and is what the next person reads
    // off the live catalog. Both it and the header described the reverted
    // copy-the-money design — the exact inverse of what the file does — which is
    // how the next reconciliation bug gets written.
    const header = MIGRATION.slice(0, MIGRATION.indexOf('BEGIN;'));
    const columnComment = sliceBetween(
      MIGRATION,
      'COMMENT ON COLUMN public.entries.moved_from_entry_id IS',
      'GRANT SELECT (moved_from_entry_id)'
    );

    for (const text of [header, columnComment]) {
      expect(text).toMatch(/money[- ]neutral|money does not move/i);
      expect(text).not.toMatch(/the destination carries (the source's )?money/i);
      expect(text).not.toMatch(/destination carries the money/i);
    }
    expect(columnComment).toContain('the SOURCE keeps the settlement');
  });

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

  it('stops a soft-deleted entry reserving its class seat (round 2)', () => {
    // Without `deleted_at IS NULL` the tombstoned destination keeps holding
    // (dog_id, class_id), and the exact round trip MYK9-640 exists for — move
    // up, undo, move up again — dies 23505 inside the RPC on the second press.
    expect(MIGRATION).toContain('DROP INDEX IF EXISTS public.entries_dog_class_unique_idx;');
    expect(MIGRATION).toMatch(
      /CREATE UNIQUE INDEX entries_dog_class_unique_idx\s*\n\s*ON public\.entries \(dog_id, class_id\)\s*\n\s*WHERE deleted_at IS NULL\s*\n\s*AND entry_status <> ALL \(ARRAY\['withdrawn'::text, 'scratched'::text\]\)/
    );
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
