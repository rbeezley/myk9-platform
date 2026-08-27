import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LOAD_SHOWS,
  LOAD_TOTAL_GENERATED_ENTRY_COUNT,
  loadEntryFixtureFor,
  PRIMARY_LOAD_SHOW,
} from './loadFixture';

const repoRoot = resolve(process.cwd(), '../..');
const seed = readFileSync(resolve(repoRoot, 'supabase/seed-demo.sql'), 'utf8');

describe('canonical MYK9-109 load fixture', () => {
  it('adds 63 deterministic dogs across the eight non-finalized canonical classes', () => {
    expect(seed).toContain('-- MYK9-109 LOAD FIXTURE START');
    expect(seed).toContain('generate_series(1, 63)');
    expect(seed).toContain('generate_series(1, 8)');
    expect(seed).toContain('63 dogs x 8 classes = 504');
    expect(seed).toContain('excludes finalized class dec1a55e-0000-0000-0000-000000000031');
  });

  it('cleans the deterministic range before recreating it', () => {
    expect(seed).toContain('-- MYK9-109 LOAD FIXTURE CLEANUP');
    expect(seed).toMatch(/DELETE FROM public\.entries[\s\S]+myk9_109/);
    expect(seed).toMatch(/DELETE FROM public\.dogs[\s\S]+myk9_109/);
  });

  it('refuses to replace a show while packet snapshots still reference storage objects', () => {
    expect(seed).not.toContain('DELETE FROM public.trial_packet_snapshots');
    expect(seed).toMatch(
      /IF EXISTS[\s\S]*FROM public\.trial_packet_snapshots[\s\S]*RAISE EXCEPTION/
    );
  });

  it('asserts the declared 514-row show total', () => {
    expect(seed).toContain('MYK9-109 expected 514 demo-show entries');
  });
});

/**
 * These assertions are numeric rather than textual wherever possible. A test that
 * greps for a string proves someone typed it, not that the seed produces what the
 * fixture claims — and the seed cannot be executed here (no container runtime), so
 * agreement between the two files is the only check available before CI.
 */
describe('multi-show seed agrees with the fixture', () => {
  const midShows = LOAD_SHOWS.slice(1);

  /**
   * Just the 17b insert block. Slicing to end-of-file would sweep in the show-0
   * postcondition that follows it, which legitimately names show 0.
   */
  const multiShowBlock = (() => {
    const start = seed.indexOf('-- 17b. MULTI-SHOW LOAD FIXTURE');
    const end = seed.indexOf('-- 18.', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return seed.slice(start, end);
  })();

  it('declares the block and its provenance', () => {
    expect(seed).toContain('-- 17b. MULTI-SHOW LOAD FIXTURE (shows 1-3)');
    expect(seed).toContain('apps/myk9show/src/test/load/loadFixture.ts');
  });

  it('generates exactly the number of shows, trials, classes and dogs the fixture declares', () => {
    expect(seed).toContain(`generate_series(1, ${midShows.length}) AS load_shows(s)`);
    expect(seed).toContain(`generate_series(1, ${midShows[0].trials.length}) AS load_trials(t)`);
    expect(seed).toContain(`generate_series(1, ${midShows[0].ringCount}) AS load_classes(c)`);
    expect(seed).toContain(`generate_series(1, ${midShows[0].dogCount}) AS load_dogs(dog_number)`);
  });

  it('uses the fixture ring count in the entry-number formula', () => {
    // entry_number = (dog - 1) * ringCount + class. A mismatch here would give
    // every show the wrong entry ids without changing any literal id in the file.
    expect(seed).toContain(`((dog_number - 1) * ${midShows[0].ringCount}) + class_number`);
  });

  it('derives armband numbers the same way the fixture does', () => {
    // Fixture: armbandBase = 2000 + index * 1000, armband = base + dogNumber.
    expect(midShows[0].armbandBase).toBe(3000);
    expect(seed).toContain('2000 + (s * 1000) + dog_number');
  });

  it('emits every id inside a range the cleanup block deletes', () => {
    const ranges = [
      ['a1090000-0000-0000-0001-', 'a1090000-0000-0000-0002-'], // dogs
      ['a1090000-0000-0000-0002-', 'a1090000-0000-0000-0003-'], // entries
      ['a1090000-0000-0000-0003-', 'a1090000-0000-0000-0004-'], // armbands
      ['a1090000-0000-0000-0010-', 'a1090000-0000-0000-0011-'], // shows
      ['a1090000-0000-0000-0011-', 'a1090000-0000-0000-0012-'], // trials
      ['a1090000-0000-0000-0012-', 'a1090000-0000-0000-0013-'], // classes
      ['a1090000-0000-0000-0013-', 'a1090000-0000-0000-0014-'], // clubs
    ];
    for (const [lower, upper] of ranges) {
      // Each range must be both written by the insert block and removed by cleanup,
      // or rows accumulate one orphaned set per reseed.
      expect(seed).toContain(`${lower}%s%s`);
      expect(seed).toContain(`${lower}000000000000'::uuid`);
      expect(seed).toContain(`${upper}000000000000'::uuid`);
    }
  });

  it('places every mid-show fixture id in one of those ranges', () => {
    for (const show of midShows) {
      expect(show.showId.startsWith('a1090000-0000-0000-0010-')).toBe(true);
      for (const trial of show.trials) {
        expect(trial.trialId.startsWith('a1090000-0000-0000-0011-')).toBe(true);
        for (const classId of trial.classIds) {
          expect(classId.startsWith('a1090000-0000-0000-0012-')).toBe(true);
        }
      }
      const entry = loadEntryFixtureFor(show.index, 1);
      expect(entry.entryId.startsWith('a1090000-0000-0000-0002-')).toBe(true);
      expect(entry.dogId.startsWith('a1090000-0000-0000-0001-')).toBe(true);
    }
  });

  it('gives each additional show its own club', () => {
    // `manageable_show_ids()` resolves through a CLUB-scoped arm
    // (`is_trial_secretary(s.club_id)`), so shows sharing a club are all
    // manageable by that club's secretary regardless of show-scoped grants.
    // Per-show credential scoping is impossible on a shared club.
    expect(multiShowBlock).toContain('INSERT INTO public.clubs');
    expect(multiShowBlock).toContain(
      "format('a1090000-0000-0000-0013-%s%s', s, lpad('1', 11, '0'))::uuid,\n  30.00"
    );
  });

  it('deletes clubs after their shows, never before', () => {
    const showDelete = seed.indexOf(
      "DELETE FROM public.shows\nWHERE id >= 'a1090000-0000-0000-0010-000000000000'"
    );
    const clubDelete = seed.indexOf(
      "DELETE FROM public.clubs\nWHERE id >= 'a1090000-0000-0000-0013-000000000000'"
    );
    expect(showDelete).toBeGreaterThan(-1);
    expect(clubDelete).toBeGreaterThan(showDelete);
  });

  it('grants each per-show secretary conditionally, never breaking a reseed', () => {
    // These accounts come from the admin API, not this seed. An unconditional
    // grant would fail every reseed until someone provisions them; the harness
    // fails closed at dispatch instead.
    expect(seed).toContain("format('load-secretary-%s@myk9t.com', s)");
    expect(seed).toContain('p.auth_user_id IS NOT NULL');
    // Must NOT appear in the preflight that raises on a missing account.
    const preflight = seed.slice(0, seed.indexOf('-- 0. Idempotency'));
    expect(preflight).not.toContain('load-secretary-');
  });

  it('deletes armbands before dogs, so the dog delete cannot be blocked', () => {
    const armbandRange = seed.indexOf("id >= 'a1090000-0000-0000-0003-000000000000'");
    const dogRange = seed.indexOf("id >= 'a1090000-0000-0000-0001-000000000000'");
    expect(armbandRange).toBeGreaterThan(-1);
    expect(dogRange).toBeGreaterThan(-1);
    expect(armbandRange).toBeLessThan(dogRange);
  });

  it('asserts the platform-wide totals the fixture computes', () => {
    expect(seed).toContain(`found %', v_total`);
    expect(seed).toContain(`<> ${LOAD_TOTAL_GENERATED_ENTRY_COUNT} THEN`);
    expect(seed).toContain(`<> ${midShows[0].generatedEntryCount} THEN`);
    expect(seed).toContain(`<> ${midShows.length} THEN`);
  });

  it('enables self-check-in explicitly rather than relying on the cascade default', () => {
    // The exhibitor self-check-in workload writes check_in_status, one of the
    // class-row lock holders under test. An absent settings row would default to
    // enabled today, but silently follow any future change to that default.
    expect(multiShowBlock).toContain('INSERT INTO public.show_visibility_settings');
    expect(multiShowBlock).toContain(
      "'open', 'class_complete', 'immediate', 'immediate', 'immediate', true"
    );
  });

  it('leaves the original show untouched by the multi-show block', () => {
    expect(multiShowBlock).not.toContain(PRIMARY_LOAD_SHOW.showId);
    for (const classId of PRIMARY_LOAD_SHOW.classIds) {
      expect(multiShowBlock).not.toContain(classId);
    }
  });
});
