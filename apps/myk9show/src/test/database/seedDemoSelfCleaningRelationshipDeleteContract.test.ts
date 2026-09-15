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
    expect(guardBlock).toContain("e.payment_status = 'paid'");
    expect(guardBlock).toContain('public.stripe_orders');
    expect(guardBlock).toContain(`en.id = '${ENROLLMENT_ID}'`);
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
