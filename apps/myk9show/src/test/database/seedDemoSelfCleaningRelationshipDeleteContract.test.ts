import { readFileSync } from 'node:fs';
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
 */

const repoRoot = resolve(__dirname, '../../../../..');
const ENROLLMENT_ID = 'dededede-0000-0000-0000-000000000070';
const LOAD_DOG_RANGE_LOW = 'a1090000-0000-0000-0001-000000000000';

const rawSeed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');

// A commented-out statement satisfies a raw substring search (LESSONS
// comment-satisfies-grep), so strip `--` line comments and `/* */` blocks
// before indexing. Offsets below are into this stripped text; the only thing
// asserted about them is relative order, which stripping preserves.
const seed = rawSeed.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

/** Every top-level statement matching `pattern`, with its offset. */
function statements(pattern: RegExp): Array<{ text: string; index: number }> {
  return [...seed.matchAll(pattern)].map(m => ({ text: m[0], index: m.index as number }));
}

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

  it('refuses, loudly, to delete a paid or Stripe-backed stray before the relationship delete', () => {
    const relationshipDelete = seed.indexOf(
      `DELETE FROM public.entries\nWHERE registration_id = '${ENROLLMENT_ID}'`
    );
    const guard = seed.lastIndexOf('RAISE EXCEPTION', relationshipDelete);
    expect(guard, 'no fail-loud guard precedes the relationship delete').toBeGreaterThan(-1);

    const guardBlockStart = seed.lastIndexOf('DO $$', guard);
    const guardBlock = seed.slice(guardBlockStart, relationshipDelete);
    expect(guardBlock).toContain("e.payment_status IN ('paid', 'refunded')");
    expect(guardBlock).toContain(`en.id = '${ENROLLMENT_ID}'`);
    // MYK9-527: the Stripe check must be keyed directly on stripe_orders' OWN
    // scope columns (show_id / enrollment_id), not only reached through an
    // enrollment join — once either FK is already null (true of every row on
    // staging, from a past reseed) a join-only guard can never match again.
    expect(guardBlock).toContain('FROM public.stripe_orders so');
    expect(guardBlock).toContain("so.show_id = 'dededede-0000-0000-0000-000000000010'");
    expect(guardBlock).toContain(`so.enrollment_id = '${ENROLLMENT_ID}'`);
  });

  it('never DELETEs from stripe_orders, and reports rows a past reseed already orphaned (MYK9-527)', () => {
    // MYK9-527: 22/22 stripe_orders rows on staging were found with BOTH
    // show_id and enrollment_id already nulled by a past reseed's ON DELETE
    // SET NULL. Deleting them is NOT the fix: stripe_order_refunds.order_id is
    // itself ON DELETE SET NULL, so the delete orphans the refund rows one
    // level down (all 4 on staging hang off that set), and stripe-webhook's
    // refund path matches on payment intent — a deleted order turns a later
    // charge.refunded into the MP-12 "unmatched refund" alert with the refund
    // fact lost. The row is also unscoped by definition, so a DELETE here
    // cannot be limited to demo data. Report, never destroy.
    expect(
      seed,
      'the seed must never DELETE from stripe_orders — the row is the only local record of a real charge, and its refund children are ON DELETE SET NULL'
    ).not.toMatch(/DELETE\s+FROM\s+public\.stripe_orders/i);

    const report = seed.indexOf('WHERE show_id IS NULL AND enrollment_id IS NULL;');
    expect(report, 'no report of already-orphaned stripe_orders rows found').toBeGreaterThan(-1);
    expect(
      seed.slice(report, report + 900),
      'the orphan report must RAISE WARNING, not raise an exception or delete'
    ).toContain('RAISE WARNING');
  });

  it('guards paid strays against every parent that cascades an entry, before any of them is deleted', () => {
    // entries cascades from four parents — classes, dogs, shows, trials — so a
    // paid row reached by ANY of them is destroyed silently. This went wrong
    // twice before it was one guard: a per-show guard placed after the load
    // classes could never fire, and a show-scoped guard missed demo-show
    // entries whose DOG is a load-range fixture. Both assertions below encode
    // that: the guard exists once, and it precedes every cascading delete.
    const guard = seed.indexOf('v_real');
    expect(guard, 'no consolidated paid-stray guard').toBeGreaterThan(-1);
    const block = seed.slice(guard, seed.indexOf('END $$;', guard));

    expect(block).toContain("e.payment_status IN ('paid', 'refunded')");
    // One arm per cascade parent: all four columns are nullable and nothing
    // constrains an entry's show_id to agree with its class's show.
    expect(block, 'no show_id arm').toContain('e.show_id IN');
    expect(block, 'no trial_id arm — a seeded trial delete would cascade unguarded').toContain(
      'e.trial_id IN'
    );
    expect(block, 'no class_id arm — a seeded class delete would cascade unguarded').toContain(
      'e.class_id IN'
    );
    expect(block, 'no dog range arm').toContain('e.dog_id >=');
    expect(block, 'no demo-dog arm').toContain('e.dog_id IN');
    expect(block).toMatch(/RAISE EXCEPTION[^;]*show, trial, class or dog this reseed deletes/);

    // The arms must be a DISJUNCTION. Rewriting the ORs to ANDs leaves every
    // assertion above satisfied while the guard matches nothing — an inert
    // guard that reads as a live one, which is the failure this file exists
    // to prevent one level up.
    expect(block, 'trial arm is not OR-joined').toMatch(/OR e\.trial_id IN/);
    expect(block, 'class arm is not OR-joined').toMatch(/OR e\.class_id IN/);
    expect(block, 'dog range arm is not OR-joined').toMatch(/OR \(e\.dog_id >=/);
    expect(block, 'demo dog arm is not OR-joined').toMatch(/OR e\.dog_id IN/);
    expect(block, 'the abort threshold was moved off zero').toContain('IF v_real > 0 THEN');

    // The guard must distinguish a row with a payment trail (abort) from a bare
    // paid flag with none (warn). Collapsing the two puts a manual DELETE in
    // front of the reseed for QA-walk artifacts that carry nothing.
    expect(block, 'no substantiated/bare split').toContain('substantiated AS (');
    expect(block, 'bare rows must warn, not be silent').toMatch(
      /RAISE WARNING[^;]*carry no payment trail/
    );
    for (const trail of [
      's.stripe_payment_intent_id IS NOT NULL',
      's.payment_reference IS NOT NULL',
      's.refunded_at IS NOT NULL',
      // A decided refund may be recorded without refunded_at being set.
      's.refund_amount IS NOT NULL',
      's.refund_decided_at IS NOT NULL',
      // Check and cash payments a secretary records have no Stripe trail by
      // design. Without these three the guard reads a recorded $30 check as a
      // worthless artifact and deletes it with a warning — which is how it
      // came to classify money as disposable to keep the script green.
      "s.payment_method IS NOT NULL AND s.payment_method <> 'waived'",
      's.payment_received_on IS NOT NULL',
      's.payment_notes IS NOT NULL',
      'public.entry_status_history',
      'public.stripe_orders',
    ]) {
      expect(block, `substantiation drops ${trail}`).toContain(trail);
    }
    // The warning has to carry the facts an operator judges on. Ids alone
    // cannot tell them whether the row they are about to lose was money.
    expect(block, 'the bare-row warning does not print payment_method / entry_fee').toMatch(
      /method=.*fee=/s
    );

    // Each derived arm must actually resolve against scope_shows. Emptying a
    // subquery (`... WHERE false`) leaves every structural assertion green
    // while that arm matches nothing.
    expect(block, 'an arm was neutered with a constant-false predicate').not.toMatch(
      /WHERE\s+false|WHERE\s+1\s*=\s*0|AND\s+false/i
    );
    const scopeRefs = (block.match(/SELECT id FROM scope_shows/g) ?? []).length;
    expect(
      scopeRefs,
      'the show, trial and class arms no longer all derive from scope_shows'
    ).toBeGreaterThanOrEqual(3);
    // deleted_at is ignored on purpose: a soft-deleted row still cascades, so
    // the PREDICATE must not filter on it. The message may still mention it —
    // it tells the operator why soft-deleting does not clear the abort — so
    // this matches the filter forms, not the word.
    expect(block, 'a deleted_at filter would let a soft-deleted paid row through').not.toMatch(
      /e\.deleted_at|deleted_at\s+IS\s+(NOT\s+)?NULL/i
    );

    // Placement: ahead of EVERY delete of a parent that cascades entries.
    for (const parent of ['classes', 'dogs', 'shows', 'trials']) {
      const dels = statements(new RegExp(`DELETE FROM public\\.${parent}\\b[^;]*;`, 'g'));
      expect(dels.length, `no ${parent} delete found`).toBeGreaterThan(0);
      for (const del of dels) {
        expect(
          guard,
          `the paid-stray guard runs after a ${parent} delete at offset ${del.index}, so those rows cascade unguarded`
        ).toBeLessThan(del.index);
      }
    }
  });

  it('extends the consolidated guard to enrollments, scoped from scope_shows, before the first parent delete (MYK9-528)', () => {
    // enrollments.show_id is ALSO ON DELETE CASCADE from shows, and this
    // section deletes every show in scope_shows — so a paid enrollment on any
    // of them (not only the demo show, and not only the demo exhibitor) is
    // destroyed silently unless this arm catches it too. Unlike entries,
    // enrollments has no trial_id / class_id / dog_id, so one arm — scoped by
    // show_id alone — covers the whole cascade.
    const guard = seed.indexOf('v_real');
    const block = seed.slice(guard, seed.indexOf('END $$;', guard));

    expect(block, 'no enrollments arm').toContain('FROM public.enrollments en');
    expect(
      block,
      "enrollments' payment_status vocabulary (migration 168) is not covered"
    ).toContain(
      "en.payment_status IN\n            ('paid', 'paid_online', 'paid_by_cash', 'paid_by_check', 'refunded', 'partial_refund')"
    );
    expect(block, 'no show_id scoping on the enrollments arm').toContain(
      'en.show_id IN (SELECT id FROM scope_shows)'
    );
    expect(block, 'the enrollments arm no longer derives from scope_shows').toMatch(
      /enrollment_stray AS \(\s*SELECT[^)]*FROM public\.enrollments en/
    );
    expect(block).toMatch(/RAISE EXCEPTION[^;]*enrollment\(s\) with a real payment trail/);
    expect(block, 'bare enrollment rows must warn, not be silent').toMatch(
      /RAISE WARNING[^;]*paid\/refunded enrollment\(s\)[^;]*carry no payment trail/
    );

    // Substantiation trail: mirrors the entries arm's "guard the harm, not the
    // label" split, using enrollments' OWN columns (it has no
    // entry_status_history or entry_fee of its own).
    for (const trail of [
      's.payment_reference IS NOT NULL',
      's.paid_amount > 0',
      's.total_amount IS NOT NULL',
      's.refund_amount IS NOT NULL',
      's.refunded_at IS NOT NULL',
      's.check_number IS NOT NULL',
      's.payment_date IS NOT NULL',
      's.group_reference IS NOT NULL',
      's.payment_notes IS NOT NULL',
    ]) {
      expect(block, `enrollment substantiation drops ${trail}`).toContain(trail);
    }
    expect(
      block,
      'the enrollments arm must also check stripe_orders.enrollment_id, not only its own columns'
    ).toContain('FROM public.stripe_orders so WHERE so.enrollment_id = s.id');

    // Self-trip freedom: the seed's own multi-dog order (section 6b) is paid
    // by fixture and is NOT yet deleted at this point in the file (its DELETE
    // depends on the registration_id-scoped entries clear further down), so it
    // must be excluded by id, not merely relied on to have already been removed.
    expect(
      block,
      "the seed's own enrollment (...070) is not excluded from the new arm — every rerun would refuse itself"
    ).toContain("en.id <> 'dededede-0000-0000-0000-000000000070'");

    // No constant-false neutering, same failure mode as the entries arms.
    expect(block, 'the enrollments arm was neutered with a constant-false predicate').not.toMatch(
      /enrollment_stray AS[\s\S]*?WHERE\s+false|enrollment_stray AS[\s\S]*?AND\s+false/i
    );

    // Placement: before the first delete of `shows` (the only cascade parent
    // enrollments has), same as the entries arms.
    const showsDeletes = statements(/DELETE FROM public\.shows\b[^;]*;/g);
    expect(showsDeletes.length).toBeGreaterThan(0);
    for (const del of showsDeletes) {
      expect(
        guard,
        `the enrollments arm runs after a shows delete at offset ${del.index}, so those rows cascade unguarded`
      ).toBeLessThan(del.index);
    }
  });

  it("lets no entries delete widen past the seed's own ids before the guard", () => {
    // Placement alone does not protect the money rows. A DELETE FROM entries
    // that runs BEFORE the guard and is scoped wider than the seed's own ids
    // removes the strays the guard exists to catch, and every placement
    // assertion stays green — the same shape as the two defects already found.
    // So pin what may precede it: exactly the two id-scoped deletes.
    const guard = seed.indexOf('v_real');
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
    // forget the guard, and its paid entries cascade away silently.
    const guard = seed.indexOf('v_real');
    const block = seed.slice(guard, seed.indexOf('END $$;', guard));
    const covered = (literal: string) => block.includes(`'${literal}'`);

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
    // reordering them would make every rerun refuse itself.
    const hardCodedDelete = seed.indexOf(
      "DELETE FROM public.entries WHERE id IN (\n  'dededede-0000-0000-0000-000000000051'"
    );
    const guard = seed.indexOf('DO $$\nDECLARE v_paid integer;');
    expect(hardCodedDelete, 'hard-coded seed entries delete not found').toBeGreaterThan(-1);
    expect(guard, 'fail-loud guard not found').toBeGreaterThan(-1);
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
