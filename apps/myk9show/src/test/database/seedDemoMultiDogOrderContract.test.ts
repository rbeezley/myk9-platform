import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for the multi-dog order fixture in supabase/seed-demo.sql.
 *
 * `groupEntriesByOrder` builds ONE card per online order via
 * `entries.registration_id`, falling back to show+dog only when it is null.
 * Nothing in the app writes that column: a DB trigger (migration 132) sets it
 * when a Stripe order flips to 'succeeded'. Every other seeded entry is
 * inserted directly, never through Stripe, so before this fixture EVERY seeded
 * card took the fallback path — one card per dog per show.
 *
 * The consequence was invisible and expensive: the multi-dog card (per-dog
 * band, dog-group grid, per-dog check-in scoping, joined name on
 * Edit/Receipt) could not be reached on staging at all, so any visual check of
 * `/exhibitor/entries` was looking at the fallback layout while believing it
 * had seen the shipped one.
 *
 * These assertions pin the fixture's SUBSTANCE — that it links two or more
 * distinct dogs — rather than merely that some enrollment exists. A fixture
 * that linked one dog would satisfy a naive string match and restore exactly
 * the blind spot this exists to remove.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const DEMO_SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const ENROLLMENT_ID = 'dededede-0000-0000-0000-000000000070';

const seed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');

/** entry id -> dog id, parsed from the section 6 entries INSERT. */
function entryToDog(): Map<string, string> {
  const start = seed.indexOf('INSERT INTO public.entries (');
  expect(start, 'entries INSERT not found in seed').toBeGreaterThan(-1);
  const block = seed.slice(start, seed.indexOf('-- 6b. MULTI-DOG ORDER FIXTURE'));
  const map = new Map<string, string>();
  // Each tuple opens with the entry id, then the dog id.
  const tuple = /\(\s*'([0-9a-f-]{36})',\s*\n?\s*'([0-9a-f-]{36})'/g;
  let match: RegExpExecArray | null;
  while ((match = tuple.exec(block)) !== null) {
    map.set(match[1] as string, match[2] as string);
  }
  return map;
}

/** The entry ids the fixture links to the enrollment. */
function linkedEntryIds(): string[] {
  const update = seed.slice(seed.indexOf(`SET registration_id = '${ENROLLMENT_ID}'`));
  const inList = update.slice(update.indexOf('WHERE id IN ('), update.indexOf(');'));
  return [...inList.matchAll(/'([0-9a-f-]{36})'/g)].map(m => m[1] as string);
}

describe('seed-demo multi-dog order fixture', () => {
  it('creates an enrollment for the demo show and the exhibitor account', () => {
    const insert = seed.slice(
      seed.indexOf('INSERT INTO public.enrollments ('),
      seed.indexOf('-- Willow (051/052, Saturday trial)')
    );
    expect(insert).toContain(ENROLLMENT_ID);
    expect(insert).toContain(DEMO_SHOW_ID);
    expect(insert).toContain("lower(email)='exhibitor@myk9t.com'");
    expect(insert).toContain("'paid'");
  });

  it('links entries belonging to at least TWO distinct dogs', () => {
    // The whole point. One dog would render the ordinary single-dog card and
    // leave the multi-dog path unreachable, which is the bug being fixed.
    const map = entryToDog();
    const linked = linkedEntryIds();
    expect(linked.length).toBeGreaterThanOrEqual(2);

    const dogs = new Set(linked.map(id => map.get(id)));
    expect(dogs.has(undefined), `linked entry id not found in the entries INSERT`).toBe(false);
    expect(dogs.size).toBeGreaterThanOrEqual(2);
  });

  it('links only entries that are actually paid', () => {
    // The trigger fires on a SUCCEEDED Stripe order, so it can only ever link
    // paid rows. A fixture linking a pending entry would model something the
    // production path cannot produce.
    const start = seed.indexOf('INSERT INTO public.entries (');
    const block = seed.slice(start, seed.indexOf('-- 6b. MULTI-DOG ORDER FIXTURE'));
    // Slice to the NEXT tuple opener, not to the next `),` — each tuple embeds
    // a `(SELECT ... )` for handler_id whose closing paren would cut the tuple
    // short, before the payment column is reached.
    const tupleStarts = [...block.matchAll(/\n {2}\('/g)].map(m => m.index as number);
    for (const id of linkedEntryIds()) {
      const at = block.indexOf(`'${id}'`);
      expect(at, `entry ${id} missing from the entries INSERT`).toBeGreaterThan(-1);
      const end = tupleStarts.find(start => start > at) ?? block.length;
      const tuple = block.slice(at, end);
      expect(tuple, `entry ${id} is linked to the order but is not paid`).toContain("'paid'");
    }
  });

  it('clears the enrollment by id AND by its unique (show, handler) pair', () => {
    // (show_id, handler_id) is uniquely indexed. Clearing only by id would let
    // a stray enrollment survive, absorb the insert, and leave the UPDATE
    // pointing at an id that does not exist.
    const cleanup = seed.slice(
      seed.indexOf('DELETE FROM public.enrollments'),
      seed.indexOf('-- 1. Clubs')
    );
    expect(cleanup).toContain(ENROLLMENT_ID);
    expect(cleanup).toContain(DEMO_SHOW_ID);
    expect(cleanup).toContain("lower(email)='exhibitor@myk9t.com'");
  });

  it('deletes the enrollment after the entries that reference it', () => {
    // entries.registration_id is a NO ACTION FK, so the reverse order fails.
    const entriesDelete = seed.indexOf('DELETE FROM public.entries WHERE id IN (');
    const enrollmentDelete = seed.indexOf('DELETE FROM public.enrollments');
    expect(entriesDelete).toBeGreaterThan(-1);
    expect(enrollmentDelete).toBeGreaterThan(entriesDelete);
  });

  it('inserts unconditionally, so a collision is loud rather than silent', () => {
    const insert = seed.slice(
      seed.indexOf('INSERT INTO public.enrollments ('),
      seed.indexOf('-- Willow (051/052, Saturday trial)')
    );
    expect(insert).not.toContain('ON CONFLICT');
  });
});
