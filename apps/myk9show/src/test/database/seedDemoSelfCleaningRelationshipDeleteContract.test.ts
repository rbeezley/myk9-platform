import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for the MYK9-490 self-cleaning follow-up in
 * supabase/seed-demo.sql.
 *
 * The clear section used to remove rows by hard-coded id lists (or id-range
 * bounds) only. A row created OUTSIDE those lists — a stray wizard entry, a
 * stray waitlist join, an abandoned cart — was invisible to them and blocked a
 * later DELETE with a foreign-key violation. On 2026-09-12 a manual walk
 * through the registration wizard against the demo show created an entry
 * (fdf15504-d9ea-4862-b373-40db20cc4566) whose registration_id pointed at the
 * seed's multi-dog enrollment; it was not in the id list, and it blocked the
 * enrollment delete via entries_registration_id_fkey.
 *
 * The fix adds deletes keyed on the PARENT RELATIONSHIP (registration_id /
 * dog_id / class_id) ahead of every delete of that parent, and a fail-loud
 * guard so a PAID stray is refused rather than silently destroyed. These
 * assertions pin that those statements exist, are live SQL (not commented
 * out), and run BEFORE the parent row they protect.
 *
 * Limits, stated so nobody mistakes this for behavioural coverage: it reads
 * source text. It cannot prove a subquery resolves, that a DELETE reaches the
 * right rows, or that the seed survives a stray on staging. That proof is a
 * reseed log, or a supabase/tests/ case, which run only against a database.
 *
 * MYK9-538 acted on exactly that limit for the consolidated paid-stray guard:
 * its body moved into public.seed_demo_assert_no_paid_strays() (migration
 * 20260916213500) and is now exercised by
 * supabase/tests/seed_demo_paid_stray_guard_test.sql and
 * …_scopes_test.sql, which call it against real rows and kill every
 * arm-neutering mutation that used to pass here. The assertions that tried to
 * prove that guard LIVE from its text are gone; what is left about it is what
 * only this file can see — where the call sits relative to the deletes it
 * protects, and whether the guard still names every id-space the seed grew.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const ENROLLMENT_ID = 'dededede-0000-0000-0000-000000000070';
const SHOW_010_ID = 'dededede-0000-0000-0000-000000000010';
const LOAD_DOG_RANGE_LOW = 'a1090000-0000-0000-0001-000000000000';

const rawSeed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');

/** Strip `--` line comments and block comments from SQL text. */
const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

// A commented-out statement satisfies a raw substring search (LESSONS
// comment-satisfies-grep), so strip comments before indexing. Offsets below are
// into this stripped text; the only thing asserted about them is relative
// order, which stripping preserves.
const seed = stripSqlComments(rawSeed);

/** Every top-level statement matching `pattern`, with its offset. */
function statements(pattern: RegExp): Array<{ text: string; index: number }> {
  return [...seed.matchAll(pattern)].map(m => ({ text: m[0], index: m.index as number }));
}

/**
 * The paid-stray guard's BODY now lives in a migration, not in the seed
 * (MYK9-538). Read it from the LATEST migration that defines the function —
 * rebuilding it from an older file silently reverts later shape changes
 * (LESSONS replace-function-latest) — so the drift check below still asks the
 * question only source text can answer: does the guard name every show and dog
 * id-space this seed deletes?
 */
const migrationsDir = join(repoRoot, 'supabase/migrations');

const guardFunctionSource = ((): string => {
  // Anchored on CREATE OR REPLACE, not on the bare signature: `COMMENT ON
  // FUNCTION` and the three `REVOKE ALL ON FUNCTION` lines carry the signature
  // too, so a later grant-only or comment-only migration would be picked as
  // "the definition", hold none of the scope ids, and fail the drift check
  // below with a message blaming the seed.
  const defining = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f =>
      readFileSync(join(migrationsDir, f), 'utf8').includes(
        'CREATE OR REPLACE FUNCTION public.seed_demo_assert_no_paid_strays()'
      )
    );
  if (defining.length === 0) {
    throw new Error(
      'no migration defines public.seed_demo_assert_no_paid_strays() — the paid-stray guard has no body'
    );
  }
  // Comments stripped: an id kept only in prose after being dropped from
  // `scope_shows` must NOT read as covered (LESSONS comment-satisfies-grep).
  return stripSqlComments(readFileSync(join(migrationsDir, defining[defining.length - 1]), 'utf8'));
})();

const uuidsIn = (text: string): string[] => [...text.matchAll(/'([0-9a-f-]{36})'/g)].map(m => m[1]);

describe('seed-demo self-cleaning relationship deletes (MYK9-490 follow-up)', () => {
  it('deletes entries by registration_id (not just by hard-coded id) before the enrollment delete', () => {
    const relationshipDelete = seed.indexOf(
      `DELETE FROM public.entries\nWHERE registration_id = '${ENROLLMENT_ID}'`
    );
    const enrollmentDelete = seed.indexOf('DELETE FROM public.enrollments');

    expect(
      relationshipDelete,
      'entries-by-registration_id delete not found — the MYK9-490 self-cleaning fix was removed or commented out'
    ).toBeGreaterThan(-1);
    expect(enrollmentDelete).toBeGreaterThan(-1);
    expect(
      relationshipDelete,
      'entries.registration_id is NO ACTION, so this delete must run before the enrollment it protects'
    ).toBeLessThan(enrollmentDelete);

    // The whole point is to catch a STRAY row whose registration_id resolves
    // to the enrollment through a subquery scoped to the seed's own
    // (show, handler) pair — not merely restate the hard-coded id, and not a
    // wider scope that would reach other handlers or other shows.
    const statementEnd = seed.indexOf(';', relationshipDelete);
    const statement = seed.slice(relationshipDelete, statementEnd);
    expect(statement).toContain('SELECT id FROM public.enrollments');
    expect(statement).toContain("show_id = 'dededede-0000-0000-0000-000000000010'");
    expect(statement).toContain("lower(email)='exhibitor@myk9t.com'");
  });

  it('refuses, loudly, to delete a paid stray before the relationship delete, printing ids', () => {
    const relationshipDelete = seed.indexOf(
      `DELETE FROM public.entries\nWHERE registration_id = '${ENROLLMENT_ID}'`
    );
    const guard = seed.lastIndexOf('RAISE EXCEPTION', relationshipDelete);
    expect(guard, 'no fail-loud guard precedes the relationship delete').toBeGreaterThan(-1);

    const guardBlockStart = seed.lastIndexOf('DO $$', guard);
    // Only this DO block, not everything up to the relationship delete: a
    // later DO block (the stripe_orders orphan REPORT, MYK9-527) legitimately
    // mentions public.stripe_orders and would otherwise poison the
    // stripe-orders-absence check below.
    const guardBlockEnd = seed.indexOf('END $$;', guardBlockStart) + 'END $$;'.length;
    const guardBlock = seed.slice(guardBlockStart, guardBlockEnd);
    expect(guardBlock).toContain("e.payment_status IN ('paid', 'refunded')");
    expect(guardBlock).toContain(`en.id = '${ENROLLMENT_ID}'`);
    // MYK9-562: the RAISE must print the offending ids, not only a count, like
    // the extracted guard's three RAISEs do — capped at 10 the same way, and
    // with the same "First ids: %" grammar the runbook (seed-reset/SKILL.md)
    // assumes for every other guard.
    expect(guardBlock).toContain('string_agg(t.id::text');
    expect(guardBlock).toContain('FROM (SELECT id FROM strays ORDER BY id LIMIT 10) t');
    expect(guardBlock).toContain("First ids: %', v_paid, v_ids;");
  });

  it('has no DO block outside the orphan-report guard that scopes public.stripe_orders to show ...010 (MYK9-562)', () => {
    // The seed used to carry a second, narrower Stripe-orders guard right next
    // to the entries one above, scoped to the demo exhibitor's enrollment /
    // show ...010. It was deleted (not merely disabled): order_stray in
    // public.seed_demo_assert_no_paid_strays() (called earlier in section 0,
    // MYK9-538) already covers that exact scope, and that call always raises
    // first, so the narrower guard could never fire. Unlike the single-block
    // check this replaces, this scans every DO block in the file — not just
    // the one sitting next to the entries guard — so a reintroduced guard
    // placed ANYWHERE would still be caught. The one legitimate DO block that
    // both mentions stripe_orders and this file's stripe_orders section is the
    // orphan-report WARNING (MYK9-527); it is excluded by its own marker
    // (the show_id/enrollment_id IS NULL predicate no live guard would use).
    const ORPHAN_REPORT_MARKER = 'show_id IS NULL AND enrollment_id IS NULL';
    const doBlocks = [...seed.matchAll(/DO \$\$[\s\S]*?END \$\$;/g)].map(m => m[0]);
    expect(doBlocks.length, 'no DO $$ ... END $$; blocks found in seed-demo.sql').toBeGreaterThan(
      0
    );

    const suspect = doBlocks.filter(
      block =>
        !block.includes(ORPHAN_REPORT_MARKER) &&
        block.includes('public.stripe_orders') &&
        block.includes(`'${SHOW_010_ID}'`)
    );

    expect(
      suspect,
      'a DO block outside the orphan-report guard references public.stripe_orders scoped to show ...010 — the narrow Stripe-orders guard deleted under MYK9-562 may have been reintroduced, and it can never fire because order_stray in the extracted guard already covers this exact scope first'
    ).toHaveLength(0);
  });

  it('never DELETEs from stripe_orders, and reports rows a past reseed already orphaned (MYK9-527)', () => {
    // MYK9-527: 22/22 stripe_orders rows on staging were found with BOTH
    // show_id and enrollment_id already nulled by a past reseed's ON DELETE
    // SET NULL. Deleting them is NOT the fix: all 4 refund rows on staging hang
    // off that set, and stripe-webhook's
    // refund path matches on payment intent — a deleted order turns a later
    // charge.refunded into the MP-12 "unmatched refund" alert with the refund
    // fact lost. The row is also unscoped by definition, so a DELETE here
    // cannot be limited to demo data. Report, never destroy.
    expect(
      seed,
      'the seed must never DELETE from stripe_orders — the row is the only local record of a real charge, and its refund children now block the delete outright (stripe_order_refunds.order_id is ON DELETE RESTRICT, migration 20260915191700)'
    ).not.toMatch(/DELETE\s+FROM\s+public\.stripe_orders/i);

    const report = seed.indexOf('WHERE show_id IS NULL AND enrollment_id IS NULL;');
    expect(report, 'no report of already-orphaned stripe_orders rows found').toBeGreaterThan(-1);
    expect(
      seed.slice(report, report + 900),
      'the orphan report must RAISE WARNING, not raise an exception or delete'
    ).toContain('RAISE WARNING');
  });

  it('calls the extracted paid-stray guard before every parent that cascades a money row (MYK9-538)', () => {
    // The guard used to be an anonymous DO $$ block here, and this file was its
    // only automated coverage — which is how ten arm-neutering mutations run
    // inside it left eight of them green (MYK9-538). The logic now lives in
    // public.seed_demo_assert_no_paid_strays() (migration 20260916213500) and
    // is exercised by supabase/tests/seed_demo_paid_stray_guard*.sql, which
    // call it against real rows. What those cannot see, and what stays here, is
    // WHERE in this file the call sits: a live guard invoked after the first
    // cascading delete protects nothing, and that is exactly how this went
    // wrong twice before it was one guard.
    const calls = statements(/SELECT public\.seed_demo_assert_no_paid_strays\(\);/g);
    expect(calls.length, 'the seed does not call the paid-stray guard exactly once').toBe(1);
    const guard = calls[0].index;

    // entries cascades from classes, dogs, shows and trials; enrollments and
    // the RESTRICT-ed stripe_orders scope columns hang off shows and off the
    // direct enrollments delete. Every one of those statements must come after
    // the call.
    for (const parent of ['classes', 'dogs', 'shows', 'trials', 'enrollments']) {
      const dels = statements(new RegExp(`DELETE FROM public\\.${parent}\\b[^;]*;`, 'g'));
      expect(dels.length, `no ${parent} delete found`).toBeGreaterThan(0);
      for (const del of dels) {
        expect(
          guard,
          `the paid-stray guard runs after a ${parent} delete at offset ${del.index}, so those rows cascade unguarded`
        ).toBeLessThan(del.index);
      }
    }

    // enrollments has TWO ON DELETE CASCADE parents, not one: show_id AND
    // handler_id (pg_constraint confdeltype='c' on registrations_show_id_fkey
    // and registrations_handler_id_fkey). The function's enrollments arm is
    // scoped by show_id alone, which is sound only because this seed deletes no
    // people at all — add a `DELETE FROM public.people` later and every
    // enrollment that handler owns, on ANY show, cascades away with the guard
    // blind to it. Only this file can see that the seed gained such a delete.
    expect(
      /DELETE\s+FROM\s+public\.people\b/i.test(seed),
      "the seed now deletes people, but the guard's enrollments arm is scoped by show_id only — " +
        'enrollments cascade from handler_id too, so that arm must be widened first'
    ).toBe(false);
  });

  it("lets no entries delete widen past the seed's own ids before the guard", () => {
    // Placement alone does not protect the money rows. A DELETE FROM entries
    // that runs BEFORE the guard and is scoped wider than the seed's own ids
    // removes the strays the guard exists to catch, and every placement
    // assertion stays green — the same shape as the two defects already found.
    // So pin what may precede it: exactly the two id-scoped deletes.
    const guard = seed.indexOf('SELECT public.seed_demo_assert_no_paid_strays();');
    const before = statements(/DELETE FROM public\.entries\b[^;]*;/g).filter(d => d.index < guard);

    expect(before.length, 'an entries delete was added before the paid-stray guard').toBe(2);
    expect(
      before[0].text,
      'the first pre-guard entries delete is no longer the myk9_109 id range'
    ).toMatch(/id >= 'a1090000-0000-0000-0002-000000000000'/);
    expect(
      before[1].text,
      'the second pre-guard entries delete is no longer the hard-coded id list'
    ).toMatch(/id IN \(\s*'dededede-0000-0000-0000-000000000051'/);
    for (const del of before) {
      expect(
        del.text,
        `a pre-guard entries delete is scoped by ${del.text.includes('show_id') ? 'show_id' : 'a non-id column'}, which would remove strays before the guard sees them`
      ).not.toMatch(/show_id|class_id|dog_id|payment_status/);
    }
  });

  it('names every show and dog id-space the seed deletes, so a new fixture cannot drift past the guard', () => {
    // Deriving the expectation from the DELETE statements rather than
    // restating the same literals: add a sibling show or a dog range later,
    // forget the guard, and its paid entries cascade away silently. The
    // behavioural tests cannot see this — they exercise the ids the guard
    // already names, not the ids the seed grew since.
    const covered = (literal: string) => guardFunctionSource.includes(`'${literal}'`);

    for (const parent of ['shows', 'dogs']) {
      for (const del of statements(new RegExp(`DELETE FROM public\\.${parent}\\b[^;]*;`, 'g'))) {
        for (const id of uuidsIn(del.text)) {
          expect(
            covered(id),
            `${parent} ${id} is deleted by the seed but the paid-stray guard does not name it`
          ).toBe(true);
        }
      }
    }
  });

  it("runs the hard-coded entries delete before the guard, so the seed's own paid rows never trip it", () => {
    // Entries ...051/052/055/056 are seeded paid under the enrollment. The guard
    // must see only strays, which means the id-list delete has to come first;
    // reordering them would make every rerun refuse itself. Anchored on the
    // consolidated guard's CALL: this used to resolve `guard` to the unrelated
    // narrower `DO $$ DECLARE v_paid integer;` block further down section 0,
    // which sits after almost everything and made the ordering trivially true.
    const hardCodedDelete = seed.indexOf(
      "DELETE FROM public.entries WHERE id IN (\n  'dededede-0000-0000-0000-000000000051'"
    );
    const guard = seed.indexOf('SELECT public.seed_demo_assert_no_paid_strays();');
    expect(hardCodedDelete, 'hard-coded seed entries delete not found').toBeGreaterThan(-1);
    expect(guard, 'the paid-stray guard call was not found').toBeGreaterThan(-1);
    expect(hardCodedDelete).toBeLessThan(guard);
  });

  it('deletes waitlist_entries and entry_cart_items by dog_id before every dogs delete that shares its ids', () => {
    const waitlistDeletes = statements(/DELETE FROM public\.waitlist_entries\b[^;]*;/g);
    const cartDeletes = statements(/DELETE FROM public\.entry_cart_items\b[^;]*;/g);
    const dogsDeletes = statements(/DELETE FROM public\.dogs\b[^;]*;/g);

    expect(
      waitlistDeletes.length,
      'no waitlist_entries delete found — the MYK9-490 self-cleaning fix was removed'
    ).toBeGreaterThanOrEqual(2);
    expect(dogsDeletes.length).toBeGreaterThanOrEqual(2);

    // Both waitlist_entries.dog_id and entry_cart_items.dog_id are NO ACTION.
    // For each dogs delete, EVERY guard that shares one of its literal ids (an
    // id list shares ids verbatim; a UUID-range delete shares its bounds) must
    // run first — not merely the first such guard in file order, which could
    // mask a later mis-ordered one.
    for (const dogs of dogsDeletes) {
      const ids = uuidsIn(dogs.text);
      const sharesId = (guard: { text: string }) => ids.some(id => guard.text.includes(`'${id}'`));

      const waitlistPartners = waitlistDeletes.filter(sharesId);
      const cartPartners = cartDeletes.filter(sharesId);
      expect(
        waitlistPartners.length,
        `dogs delete at offset ${dogs.index} has no waitlist_entries delete guarding it`
      ).toBeGreaterThan(0);
      expect(
        cartPartners.length,
        `dogs delete at offset ${dogs.index} has no entry_cart_items delete guarding it`
      ).toBeGreaterThan(0);
      for (const partner of [...waitlistPartners, ...cartPartners]) {
        expect(
          partner.index,
          `guard at offset ${partner.index} runs after the dogs delete it protects`
        ).toBeLessThan(dogs.index);
      }
    }

    // The load-range cart guard must be keyed on dog_id: the class_id-keyed
    // one further down runs after the dogs delete and cannot unblock it.
    expect(
      cartDeletes.some(c => c.text.includes(`dog_id >= '${LOAD_DOG_RANGE_LOW}'`)),
      'load-range entry_cart_items delete keyed on dog_id not found'
    ).toBe(true);
  });

  it('preflights trial_packet_snapshots before every shows delete instead of deleting them', () => {
    // trial_packet_snapshots.show_id is RESTRICT on purpose: the private
    // Storage PDFs must be removed through the Storage API before their audit
    // rows, so the seed must refuse, never DELETE. Each shows delete needs an
    // EXISTS preflight that names the same id or range bound and runs first.
    const showsDeletes = statements(/DELETE FROM public\.shows\b[^;]*;/g);
    const preflights = statements(/SELECT 1 FROM public\.trial_packet_snapshots\b[^;]*;/g);
    expect(showsDeletes.length).toBeGreaterThanOrEqual(3);
    expect(seed).not.toMatch(/DELETE FROM public\.trial_packet_snapshots/);
    for (const shows of showsDeletes) {
      const ids = uuidsIn(shows.text);
      const partner = preflights.filter(p => ids.some(id => p.text.includes(`'${id}'`)));
      expect(
        partner.length,
        `shows delete at offset ${shows.index} has no trial_packet_snapshots preflight`
      ).toBeGreaterThan(0);
      for (const p of partner) expect(p.index).toBeLessThan(shows.index);
    }
  });

  it('clears entry_cart_items for every demo-show class the seed deletes by id', () => {
    const cartDeletes = statements(/DELETE FROM public\.entry_cart_items\b[^;]*;/g);
    const classDeletes = statements(/DELETE FROM public\.classes\b[^;]*;/g);
    const demoClassIds = classDeletes
      .flatMap(c => uuidsIn(c.text))
      .filter(id => id.startsWith('dec1a55e-'));
    expect(demoClassIds.length).toBeGreaterThan(0);

    // entry_cart_items.class_id is NO ACTION: every id-listed class the seed
    // deletes needs a cart clear that names it and runs first. Classes
    // ...036-...039 were missing from that list after MYK9-490 moved them onto
    // the demo show.
    for (const id of demoClassIds) {
      const classDelete = classDeletes.find(c => c.text.includes(`'${id}'`))!;
      const guard = cartDeletes.find(c => c.text.includes(`'${id}'`));
      expect(
        guard,
        `class ${id} is deleted with no entry_cart_items clear naming it`
      ).toBeDefined();
      expect(guard!.index).toBeLessThan(classDelete.index);
    }
  });
});
