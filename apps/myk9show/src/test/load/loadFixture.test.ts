import { describe, expect, it } from 'vitest';
import {
  loadEntryFixture,
  loadEntryFixtureFor,
  loadRingAssignment,
  LOAD_CLASS_IDS,
  LOAD_SHOWS,
  LOAD_SHOW_ID,
  LOAD_TOTAL_ENTRY_COUNT,
  LOAD_TOTAL_GENERATED_ENTRY_COUNT,
  LOAD_TOTAL_RING_COUNT,
  PRIMARY_LOAD_SHOW,
} from './loadFixture';

describe('load fixture mapping', () => {
  it('maps the deterministic entry range across eight classes and 63 dogs', () => {
    expect(loadEntryFixture(1)).toEqual({
      entryId: 'a1090000-0000-0000-0002-000000000001',
      dogId: 'a1090000-0000-0000-0001-000000000001',
      classId: LOAD_CLASS_IDS[0],
      trialId: 'dededede-0000-0000-0000-000000000021',
      showId: LOAD_SHOW_ID,
      showIndex: 0,
      dogNumber: 1,
      armband: 2001,
    });
    expect(loadEntryFixture(8).classId).toBe(LOAD_CLASS_IDS[7]);
    expect(loadEntryFixture(9).dogNumber).toBe(2);
    expect(loadEntryFixture(504)).toEqual({
      entryId: 'a1090000-0000-0000-0002-000000000504',
      dogId: 'a1090000-0000-0000-0001-000000000063',
      classId: LOAD_CLASS_IDS[7],
      trialId: 'dededede-0000-0000-0000-000000000024',
      showId: LOAD_SHOW_ID,
      showIndex: 0,
      dogNumber: 63,
      armband: 2063,
    });
  });

  it.each([0, 505, 1.5])('rejects an invalid entry number: %s', entryNumber => {
    expect(() => loadEntryFixture(entryNumber)).toThrow(/between 1 and 504/);
  });

  it('maps show-0 classes to the trials the seed actually assigns them', () => {
    // Pinned against supabase/seed-demo.sql. Classes belong to trials, and
    // ReplicatedClassesTable scopes its delta sync by trial_id, so a wrong
    // mapping would misrepresent the sync boundary rather than merely mislabel.
    expect(PRIMARY_LOAD_SHOW.trials.map(trial => [trial.trialId, [...trial.classIds]])).toEqual([
      [
        'dededede-0000-0000-0000-000000000021',
        ['dec1a55e-0000-0000-0000-000000000032', 'dec1a55e-0000-0000-0000-000000000033'],
      ],
      [
        'dededede-0000-0000-0000-000000000022',
        ['dec1a55e-0000-0000-0000-000000000034', 'dec1a55e-0000-0000-0000-000000000035'],
      ],
      [
        'dededede-0000-0000-0000-000000000023',
        ['dec1a55e-0000-0000-0000-000000000036', 'dec1a55e-0000-0000-0000-000000000037'],
      ],
      [
        'dededede-0000-0000-0000-000000000024',
        ['dec1a55e-0000-0000-0000-000000000038', 'dec1a55e-0000-0000-0000-000000000039'],
      ],
    ]);
  });

  it('excludes the finalized class from the load fixture', () => {
    // …031 is finalized and backs the released-results golden path. A rehearsal
    // write into it would corrupt that path.
    expect(PRIMARY_LOAD_SHOW.classIds).not.toContain('dec1a55e-0000-0000-0000-000000000031');
  });

  it('leaves the original show byte-identical', () => {
    // Show 0 keeps its ids and counts so every prior measurement against it, and
    // the single-session diagnostics that address it, remain comparable.
    expect(PRIMARY_LOAD_SHOW.showId).toBe('dededede-0000-0000-0000-000000000010');
    expect(PRIMARY_LOAD_SHOW.ringCount).toBe(8);
    expect(PRIMARY_LOAD_SHOW.generatedEntryCount).toBe(504);
    expect(PRIMARY_LOAD_SHOW.showEntryCount).toBe(514);
  });
});

describe('multi-show fixture', () => {
  it('describes one large show and three mid-size shows', () => {
    expect(LOAD_SHOWS).toHaveLength(4);
    expect(LOAD_SHOWS.map(show => show.ringCount)).toEqual([8, 4, 4, 4]);
    expect(LOAD_TOTAL_RING_COUNT).toBe(20);
  });

  it('gives every show disjoint ids', () => {
    const showIds = LOAD_SHOWS.map(show => show.showId);
    const trialIds = LOAD_SHOWS.flatMap(show => show.trials.map(trial => trial.trialId));
    const classIds = LOAD_SHOWS.flatMap(show => [...show.classIds]);
    expect(new Set(showIds).size).toBe(showIds.length);
    expect(new Set(trialIds).size).toBe(trialIds.length);
    expect(new Set(classIds).size).toBe(classIds.length);
  });

  it('puts two classes in every trial, matching the show-0 layout', () => {
    for (const show of LOAD_SHOWS) {
      for (const trial of show.trials) {
        expect(trial.classIds).toHaveLength(2);
      }
      expect(show.trials.length * 2).toBe(show.ringCount);
    }
  });

  it('resolves each entry to the trial that owns its class', () => {
    for (const show of LOAD_SHOWS) {
      for (let entryNumber = 1; entryNumber <= show.ringCount; entryNumber += 1) {
        const entry = loadEntryFixtureFor(show.index, entryNumber);
        const owning = show.trials.find(trial => trial.classIds.includes(entry.classId));
        expect(entry.trialId).toBe(owning?.trialId);
      }
    }
  });

  it('gives every generated entry across every show a unique id', () => {
    const entryIds = LOAD_SHOWS.flatMap(show =>
      Array.from(
        { length: show.generatedEntryCount },
        (_, index) => loadEntryFixtureFor(show.index, index + 1).entryId
      )
    );
    expect(entryIds).toHaveLength(LOAD_TOTAL_GENERATED_ENTRY_COUNT);
    expect(new Set(entryIds).size).toBe(entryIds.length);
  });

  it('totals 1,260 generated and 1,270 seeded entries', () => {
    expect(LOAD_TOTAL_GENERATED_ENTRY_COUNT).toBe(504 + 252 * 3);
    expect(LOAD_TOTAL_ENTRY_COUNT).toBe(504 + 252 * 3 + 10);
  });

  it('keeps every entry inside its own show', () => {
    for (const show of LOAD_SHOWS) {
      const last = loadEntryFixtureFor(show.index, show.generatedEntryCount);
      expect(last.showId).toBe(show.showId);
      expect(show.classIds).toContain(last.classId);
      expect(last.dogNumber).toBe(show.dogCount);
    }
  });

  it('rejects an unknown show index', () => {
    expect(() => loadEntryFixtureFor(LOAD_SHOWS.length, 1)).toThrow(/Load show index must be/);
  });

  it('rejects an entry number beyond a mid-size show', () => {
    expect(() => loadEntryFixtureFor(1, 253)).toThrow(/between 1 and 252/);
  });
});

describe('reseed cleanup ranges', () => {
  // seed-demo.sql removes load rows by contiguous UUID range. Any id that falls
  // outside its range survives the reseed and accumulates one orphaned set per
  // rehearsal, so these bounds are a hard contract with the seed, not a style.
  const ENTRY_RANGE = [
    'a1090000-0000-0000-0002-000000000000',
    'a1090000-0000-0000-0003-000000000000',
  ];
  const DOG_RANGE = [
    'a1090000-0000-0000-0001-000000000000',
    'a1090000-0000-0000-0002-000000000000',
  ];

  function inRange(id: string, [lower, upper]: string[]): boolean {
    return id >= lower && id < upper;
  }

  it('keeps every generated entry id inside the seed entry range', () => {
    for (const show of LOAD_SHOWS) {
      for (const entryNumber of [1, show.generatedEntryCount]) {
        expect(inRange(loadEntryFixtureFor(show.index, entryNumber).entryId, ENTRY_RANGE)).toBe(
          true
        );
      }
    }
  });

  it('keeps every generated dog id inside the seed dog range', () => {
    for (const show of LOAD_SHOWS) {
      for (const entryNumber of [1, show.generatedEntryCount]) {
        expect(inRange(loadEntryFixtureFor(show.index, entryNumber).dogId, DOG_RANGE)).toBe(true);
      }
    }
  });

  it('encodes the show in the first digit of the final group', () => {
    // Show 0 must remain byte-identical: a leading 0 plus eleven digits is the
    // same string as the twelve-digit ordinal used before multi-show existed.
    expect(loadEntryFixtureFor(0, 1).entryId).toBe('a1090000-0000-0000-0002-000000000001');
    expect(loadEntryFixtureFor(0, 504).entryId).toBe('a1090000-0000-0000-0002-000000000504');
    expect(loadEntryFixtureFor(1, 1).entryId).toBe('a1090000-0000-0000-0002-100000000001');
    expect(loadEntryFixtureFor(3, 252).entryId).toBe('a1090000-0000-0000-0002-300000000252');
  });

  it('keeps mid-show shows, trials and classes in their own ranges', () => {
    for (const show of LOAD_SHOWS.slice(1)) {
      expect(show.showId.startsWith('a1090000-0000-0000-0010-')).toBe(true);
      for (const trial of show.trials) {
        expect(trial.trialId.startsWith('a1090000-0000-0000-0011-')).toBe(true);
        for (const classId of trial.classIds) {
          expect(classId.startsWith('a1090000-0000-0000-0012-')).toBe(true);
        }
      }
    }
  });
});

describe('ring assignment', () => {
  it('resolves every ring ordinal to a distinct class', () => {
    const classIds = Array.from(
      { length: LOAD_TOTAL_RING_COUNT },
      (_, ordinal) => loadRingAssignment(ordinal).classId
    );
    // The property that matters: a scoring session per ring can never collide on
    // a class row. Modulo distribution over a shorter class list is what put
    // seven concurrent scorers on one class.
    expect(new Set(classIds).size).toBe(LOAD_TOTAL_RING_COUNT);
  });

  it('walks shows in order, exhausting each show rings before the next', () => {
    expect(loadRingAssignment(0)).toEqual({
      showIndex: 0,
      showId: LOAD_SHOWS[0].showId,
      trialId: LOAD_SHOWS[0].trials[0].trialId,
      classId: LOAD_SHOWS[0].classIds[0],
      ringIndex: 0,
    });
    expect(loadRingAssignment(7).showIndex).toBe(0);
    expect(loadRingAssignment(8).showIndex).toBe(1);
    expect(loadRingAssignment(8).ringIndex).toBe(0);
    expect(loadRingAssignment(LOAD_TOTAL_RING_COUNT - 1).showIndex).toBe(3);
  });

  it.each([-1, LOAD_TOTAL_RING_COUNT, 2.5])('rejects ring ordinal %s', ordinal => {
    expect(() => loadRingAssignment(ordinal)).toThrow(/Ring ordinal must be/);
  });
});
