import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text contract for the MYK9-515 full-class fixture in
 * supabase/seed-demo.sql, which the registration wizard's full-chip e2e
 * (wizardVisualQA.spec.ts) depends on.
 *
 * The fixture used to be class ...036 capped at 63 against the MYK9-109 load
 * fixture's 63 entries. MYK9-558 made that load fixture opt-in, and the cap
 * silently stopped meaning "full" on a routine reseed: the chip test went red
 * with nothing in the unit suite noticing. These assertions pin the property
 * that matters -- the lean seed ALONE produces a class whose cap equals the
 * entries the exhibitor can see in it -- rather than any particular id.
 *
 * Source text only: it cannot prove the exhibitor's RLS view counts the entry.
 * The e2e is that proof; this keeps its precondition from drifting unseen.
 */

const repoRoot = resolve(__dirname, '../../../../..');
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

const seed = stripSqlComments(read('supabase/seed-demo.sql'));
const loadFixture = stripSqlComments(read('supabase/seed-load-fixture.sql'));
const spec = read('apps/myk9show/src/test/e2e/registration/wizardVisualQA.spec.ts');

const EXHIBITOR = "lower(email)='exhibitor@myk9t.com'";

interface SeedEntry {
  id: string;
  dogId: string;
  classId: string;
  tuple: string;
}

/** Every hand-authored entry row in the seed's `INSERT INTO public.entries ... VALUES` blocks. */
function seededEntries(): SeedEntry[] {
  const rows: SeedEntry[] = [];
  for (const block of seed.matchAll(
    /INSERT INTO public\.entries\s*\([^)]*\)\s*VALUES([\s\S]*?);/g
  )) {
    // Each tuple opens with its three leading uuids: entry id, dog id, class id.
    const starts = [
      ...block[1].matchAll(/\(\s*'([0-9a-f-]{36})',\s*'([0-9a-f-]{36})',\s*'([0-9a-f-]{36})'/g),
    ];
    starts.forEach((m, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].index : block[1].length;
      rows.push({
        id: m[1],
        dogId: m[2],
        classId: m[3],
        tuple: block[1].slice(m.index, end),
      });
    });
  }
  return rows;
}

/** Dog ids the seed gives exhibitor@myk9t.com. */
function exhibitorDogIds(): Set<string> {
  const dogs = seed.slice(seed.indexOf('INSERT INTO public.dogs'));
  const block = dogs.slice(0, dogs.indexOf(';'));
  const ids = new Set<string>();
  // One row per dog: its id opens the tuple, its owner subquery closes it.
  const starts = [...block.matchAll(/\(\s*'([0-9a-f-]{36})',\s*'/g)];
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : block.length;
    if (block.slice(m.index, end).replace(/\s+/g, '').includes(EXHIBITOR)) ids.add(m[1]);
  });
  return ids;
}

const caps = [
  ...seed.matchAll(
    /UPDATE public\.classes\s+SET max_entries = (\d+)([^;]*?)WHERE id = '([0-9a-f-]{36})'\s*;/g
  ),
].map(m => ({ cap: Number(m[1]), set: m[2], classId: m[3] }));

describe('seed-demo MYK9-515 full-class fixture', () => {
  it('caps exactly one demo-show class, and it is the class the full-chip e2e targets', () => {
    expect(
      caps,
      'expected one `UPDATE public.classes SET max_entries` in seed-demo.sql'
    ).toHaveLength(1);
    const target = /const FULL_CLASS_ID = '([0-9a-f-]{36})';/.exec(spec);
    expect(target, 'FULL_CLASS_ID not found in wizardVisualQA.spec.ts').not.toBeNull();
    expect(caps[0].classId).toBe(target![1]);
  });

  it('sets the cap to exactly the lean seed own confirmed entries in that class', () => {
    const { cap, classId } = caps[0];
    const inClass = seededEntries().filter(e => e.classId === classId);
    expect(inClass.length, `no hand-authored entry in ${classId}`).toBeGreaterThan(0);
    for (const entry of inClass) {
      expect(entry.tuple, `${entry.id} must count toward capacity`).toContain("'confirmed'");
    }
    expect(cap).toBe(inClass.length);
  });

  it('fills the class with entries the exhibitor can read but none of the exhibitor own dogs', () => {
    const exhibitorDogs = exhibitorDogIds();
    expect(exhibitorDogs.size).toBe(5);
    for (const entry of seededEntries().filter(e => e.classId === caps[0].classId)) {
      // Not the exhibitor's dog: the e2e's selected dog must see "full", not
      // "already entered".
      expect(exhibitorDogs.has(entry.dogId), `${entry.id} uses an exhibitor-owned dog`).toBe(false);
      // Handled by the exhibitor: capacity is counted through the exhibitor's
      // RLS view, which admits only entries they handle or whose dog they own.
      expect(
        entry.tuple.replace(/\s+/g, ''),
        `${entry.id} is not handled by the exhibitor`
      ).toContain(`(SELECTidFROMpublic.peopleWHERE${EXHIBITOR})`);
    }
  });

  it('disables the waitlist so the reason is the contact-the-secretary branch', () => {
    expect(caps[0].set).toMatch(/allow_waitlist\s*=\s*false/);
  });

  it('keeps the class out of judge assignments, so only the class limit can make it full', () => {
    const block = seed.slice(seed.indexOf('INSERT INTO public.judge_assignments'));
    expect(block.slice(0, block.indexOf(';'))).not.toContain(caps[0].classId);
  });

  it('is untouched by the opt-in load fixture, so it is full with or without it', () => {
    expect(loadFixture).not.toContain(caps[0].classId);
    expect(loadFixture).not.toMatch(/max_entries/);
  });
});
