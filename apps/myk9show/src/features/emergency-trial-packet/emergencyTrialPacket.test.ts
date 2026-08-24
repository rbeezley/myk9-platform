import { describe, expect, it } from 'vitest';
import { formatTimeLimitSeconds } from '@myk9/core';
import type { ReportEntry } from '@/lib/reports/types';
import {
  buildEmergencyPacketFilename,
  buildEmergencyPacketModel,
  buildEmergencyPacketStoragePath,
  emergencyPacketAvailability,
  formatClassTimeLimits,
  splitPacketInputByTrialDay,
  formatEmergencyPacketPageLabel,
} from './emergencyTrialPacket';
import type { EmergencyPacketInput } from './types';

function entry(overrides: Partial<ReportEntry> & Pick<ReportEntry, 'id'>): ReportEntry {
  return {
    armband: 100,
    breed: 'Border Collie',
    callName: 'Maple',
    checkInStatus: null,
    finalPlacement: null,
    handler: 'A. Handler',
    isScored: false,
    registrationNumber: 'DN123',
    resultText: null,
    runOrder: null,
    searchTimeSeconds: null,
    section: null,
    totalFaults: null,
    ...overrides,
  };
}

/**
 * A model for one trial, one class, and `count` sequential entries — built
 * from the same fixture shapes as `input` above, just parameterized on
 * entry count so pagination tests can ask for 0 or 12 without hand-writing
 * every entry.
 */
function buildModelWithEntries(count: number) {
  const packetInput: EmergencyPacketInput = {
    generatedAt: '2026-08-20T20:15:00.000Z',
    show: {
      id: 'show-pagination',
      name: 'Pagination Trial',
      clubName: 'Prairie Dog Club',
      organization: 'AKC',
      startDate: '2026-10-03',
      endDate: '2026-10-03',
    },
    trials: [
      {
        id: 'trial-1',
        date: '2026-10-03',
        name: 'Saturday Trial',
        trialNumber: '1',
        registryId: 'AKC',
      },
    ],
    classes: [
      {
        id: 'class-1',
        trialId: 'trial-1',
        name: 'Container Novice A',
        element: 'Container',
        level: 'Novice',
        section: 'A',
        classNumber: '101',
        displayOrder: 1,
        judgeName: 'Judge One',
        ringLabel: 'Ring 1',
        startTime: '08:00',
        timeLimitSeconds: 120,
        timeLimitArea2Seconds: null,
        timeLimitArea3Seconds: null,
        numAreas: null,
        numHides: null,
        distractionCount: null,
      },
    ],
    entries: Array.from({ length: count }, (_, index) =>
      entry({
        id: `entry-${index + 1}`,
        armband: 100 + index,
        classId: 'class-1',
        trialId: 'trial-1',
        runOrder: index + 1,
      })
    ),
  };
  return buildEmergencyPacketModel(packetInput);
}

const input: EmergencyPacketInput = {
  generatedAt: '2026-08-20T20:15:00.000Z',
  show: {
    id: 'show-1',
    name: 'Old School Scent Work Trial',
    clubName: 'Prairie Dog Club',
    organization: 'AKC',
    startDate: '2026-10-03',
    endDate: '2026-10-04',
  },
  trials: [
    {
      id: 'trial-sunday',
      date: '2026-10-04',
      name: 'Sunday Trial',
      trialNumber: '2',
      registryId: 'AKC',
    },
    {
      id: 'trial-saturday',
      date: '2026-10-03',
      name: 'Saturday Trial',
      trialNumber: '1',
      registryId: 'AKC',
    },
  ],
  classes: [
    {
      id: 'class-master',
      trialId: 'trial-sunday',
      name: 'Interior Master',
      element: 'Interior',
      level: 'Master',
      section: null,
      classNumber: '201',
      displayOrder: 2,
      judgeName: 'Judge Sunday',
      ringLabel: 'Ring 2',
      startTime: '10:00',
      timeLimitSeconds: 240,
      timeLimitArea2Seconds: null,
      timeLimitArea3Seconds: null,
      numAreas: null,
      numHides: null,
      distractionCount: null,
    },
    {
      id: 'class-novice',
      trialId: 'trial-saturday',
      name: 'Container Novice A',
      element: 'Container',
      level: 'Novice',
      section: 'A',
      classNumber: '101',
      displayOrder: 1,
      judgeName: 'Judge Saturday',
      ringLabel: 'Ring 1',
      startTime: '08:00',
      timeLimitSeconds: 120,
      timeLimitArea2Seconds: null,
      timeLimitArea3Seconds: null,
      numAreas: null,
      numHides: null,
      distractionCount: null,
    },
  ],
  entries: [
    entry({
      id: 'entry-master',
      armband: 202,
      classId: 'class-master',
      trialId: 'trial-sunday',
      runOrder: 2,
    }),
    entry({
      id: 'entry-novice-no-order',
      armband: 102,
      callName: 'Paper',
      classId: 'class-novice',
      trialId: 'trial-saturday',
      runOrder: null,
    }),
    entry({
      id: 'entry-novice-first',
      armband: 101,
      callName: 'Pencil',
      classId: 'class-novice',
      trialId: 'trial-saturday',
      runOrder: 1,
    }),
  ],
};

describe('emergency trial packet model', () => {
  it('sorts trial days, classes, and run order deterministically while including every entry', () => {
    const model = buildEmergencyPacketModel(input);

    expect(model.trials.map(trial => trial.id)).toEqual(['trial-saturday', 'trial-sunday']);
    expect(
      model.pages
        .filter(page => page.kind === 'check-in')
        .flatMap(page => page.entries.map(item => item.id))
    ).toEqual(['entry-novice-first', 'entry-novice-no-order', 'entry-master']);
    expect(
      model.pages
        .filter(page => page.kind === 'score-recording')
        .flatMap(page => page.entries.map(item => item.id))
    ).toEqual(['entry-novice-first', 'entry-novice-no-order', 'entry-master']);
  });

  it('keeps unknown show-day values writable instead of claiming live state', () => {
    const model = buildEmergencyPacketModel(input);
    const noOrder = model.pages
      .flatMap(page => page.entries)
      .find(item => item.id === 'entry-novice-no-order');

    expect(noOrder).toMatchObject({ checkInMark: '', runOrderDisplay: '', resultMark: '' });
  });

  it('gives every page a visible snapshot and reconstruction label', () => {
    const model = buildEmergencyPacketModel(input);

    expect(model.snapshotMarker).toBe(true);
    expect(model.pages.every(page => page.marker === 'SNAPSHOT — NOT LIVE')).toBe(true);
    expect(model.pages.every(page => page.generatedAt === input.generatedAt)).toBe(true);
    expect(
      model.pages
        .filter(page => page.kind === 'check-in' || page.kind === 'score-recording')
        .every(page =>
          formatEmergencyPacketPageLabel(page).includes(
            `${page.context.trialDate} · ${page.context.ringLabel} · ${page.context.classLabel}`
          )
        )
    ).toBe(true);
  });

  /**
   * Whole-branch review finding #7: a check-in sheet or scoresheet printed
   * from Reports on an ordinary working day is not a degraded-mode snapshot.
   * `snapshotMarker: false` must suppress the marker on every page, not just
   * the pages Reports actually selects — a caller filtering pages later
   * should never be able to observe a leftover marker.
   */
  it('suppresses the snapshot marker on every page when snapshotMarker is false', () => {
    const model = buildEmergencyPacketModel(input, { snapshotMarker: false });

    expect(model.snapshotMarker).toBe(false);
    expect(model.pages.every(page => page.marker === '')).toBe(true);
    expect(model.pages.some(page => page.marker === 'SNAPSHOT — NOT LIVE')).toBe(false);
  });

  it('requires real trial, class, and entry data', () => {
    expect(emergencyPacketAvailability({ ...input, trials: [] })).toEqual({
      available: false,
      reason: 'Add a trial before preparing the emergency packet.',
    });
    expect(emergencyPacketAvailability({ ...input, classes: [] }).available).toBe(false);
    expect(emergencyPacketAvailability({ ...input, entries: [] }).available).toBe(false);
    expect(emergencyPacketAvailability(input)).toEqual({ available: true });
  });

  it('builds stable human filenames and immutable show-prefixed paths', () => {
    expect(buildEmergencyPacketFilename(input.show.name, input.generatedAt)).toBe(
      'old-school-scent-work-trial-emergency-packet-2026-08-20T20-15-00Z.pdf'
    );
    expect(buildEmergencyPacketStoragePath('show-1', 'snapshot-123')).toBe(
      'show-1/snapshot-123.pdf'
    );
  });
});

/**
 * Whole-block pagination for the score-recording pages. `SCORE_BLOCK_HEIGHT_MM`
 * grew to 36mm in Task 4 (class header, reason checklists, time boxes), which
 * left the old 7-rows-per-page constant printing blocks that ran off the
 * bottom of the page. Measuring the actual header height (see task-5-report.md)
 * showed 5 blocks fit on every score-recording page, first or continuation —
 * the renderer draws an identical header on both, so there is no "compact
 * continuation header" to buy back a 6th row.
 */
describe('score-recording pagination', () => {
  it('fits 5 dogs per class score page, first page and continuations alike', () => {
    const model = buildModelWithEntries(12);
    const scorePages = model.pages.filter(page => page.kind === 'score-recording');
    expect(scorePages.map(page => page.entries.length)).toEqual([5, 5, 2]);
  });

  it('never splits a dog across two pages', () => {
    const model = buildModelWithEntries(12);
    const scored = model.pages
      .filter(page => page.kind === 'score-recording')
      .flatMap(page => page.entries.map(entry => entry.id));
    expect(new Set(scored).size).toBe(scored.length);
    expect(scored).toHaveLength(12);
  });

  it('emits no score pages for a class with no entries', () => {
    // chunksWithFirst returns [] for an empty list. A cancelled class that
    // still has a row must not produce a blank sheet in the middle of the
    // packet.
    const model = buildModelWithEntries(0);
    expect(model.pages.filter(page => page.kind === 'score-recording')).toHaveLength(0);
  });

  it('identifies a continuation page by armband range and class', () => {
    // A page separated from its stack must still be identifiable — this
    // document is retained for a year. The rendered header's armband range
    // (`buildEmergencyTrialPacketPdf.ts`'s `formatArmbandRange`) is computed
    // from `page.entries`, so asserting the real min/max on THIS page (not
    // the whole class's 100-111) is what actually proves the page carries
    // the data the header needs — the rendered-text version of this is
    // `buildEmergencyTrialPacketPdf.test.ts`'s
    // 'prints the armband range for the entries actually on that page' test.
    const model = buildModelWithEntries(12);
    const [, continuation] = model.pages.filter(page => page.kind === 'score-recording');
    expect(continuation.title).toMatch(/\(2\/3\)/);
    expect(continuation.context.classLabel).toBeTruthy();
    const armbands = continuation.entries.map(entry => entry.armband);
    expect(Math.min(...armbands)).toBe(105);
    expect(Math.max(...armbands)).toBe(109);
  });
});

/**
 * MYK9-198 mock-trial-day audit. `timeLimitSeconds` was read from the DB,
 * mapped by the adapter and carried in the type — then rendered nowhere, so
 * the paper scoresheet offered "Time: ______" while never stating the class
 * maximum. On paper there is no app to check it against, and in scent work
 * the max time is the number the ring runs on.
 */
describe('formatClassTimeLimits', () => {
  const base = {
    timeLimitSeconds: null as number | null,
    timeLimitArea2Seconds: null as number | null,
    timeLimitArea3Seconds: null as number | null,
    numAreas: null as number | null,
  };

  it('states a single-area maximum', () => {
    expect(formatClassTimeLimits({ ...base, timeLimitSeconds: 120 })).toBe('Max time 2:00');
    expect(formatClassTimeLimits({ ...base, timeLimitSeconds: 180 })).toBe('Max time 3:00');
  });

  it('names each area when a class searches more than one', () => {
    // An Interior Advanced class can carry a separate limit per area; a sheet
    // showing only the first would be wrong at areas 2 and 3, not merely thin.
    expect(
      formatClassTimeLimits({
        timeLimitSeconds: 180,
        timeLimitArea2Seconds: 120,
        timeLimitArea3Seconds: 90,
        numAreas: null,
      })
    ).toBe('Max time — Area 1 3:00 · Area 2 2:00 · Area 3 1:30');
  });

  it('does not invent areas that are not configured', () => {
    expect(
      formatClassTimeLimits({ ...base, timeLimitSeconds: 180, timeLimitArea2Seconds: 120 })
    ).toBe('Max time — Area 1 3:00 · Area 2 2:00');
  });

  it('keeps each limit on its own area when an earlier one is unset', () => {
    // The columns are independently nullable. Compacting the configured values
    // renumbers them, so an area-3 limit gets printed as "Area 2" — a wrong
    // number on the page the ring times runs from (Codex review).
    expect(
      formatClassTimeLimits({
        ...base,
        timeLimitSeconds: null,
        timeLimitArea2Seconds: 120,
        timeLimitArea3Seconds: 90,
        numAreas: null,
      })
    ).toBe('Max time — Area 1 not set · Area 2 2:00 · Area 3 1:30');
  });

  it('does not present an area-2-only limit as the whole class maximum', () => {
    expect(formatClassTimeLimits({ ...base, timeLimitArea2Seconds: 120 })).toBe(
      'Max time — Area 1 not set · Area 2 2:00'
    );
  });

  it('names every area the class actually searches, even with no limit set', () => {
    // Live data has a class with num_areas > 1 and no area-2 limit. Printing a
    // bare "Max time 3:00" would imply a single-area search; the honest paper
    // output names the gap so it can be filled in by hand at the briefing.
    expect(formatClassTimeLimits({ ...base, timeLimitSeconds: 180, numAreas: 2 })).toBe(
      'Max time — Area 1 3:00 · Area 2 not set'
    );
  });

  it('still reports a stale limit configured beyond the declared area count', () => {
    expect(
      formatClassTimeLimits({
        ...base,
        timeLimitSeconds: 180,
        timeLimitArea2Seconds: 120,
        numAreas: 1,
      })
    ).toBe('Max time — Area 1 3:00 · Area 2 2:00');
  });

  it('enumerates every declared area, even past the three limit columns', () => {
    // `classes` stores only three per-area limits, and sport_class_rules tops
    // out at three areas — but nothing in the schema CONSTRAINS num_areas, and
    // clamping silently dropped the rest. Areas beyond the third are named with
    // no limit, which is the truth: the system has nowhere to record one.
    expect(formatClassTimeLimits({ ...base, timeLimitSeconds: 180, numAreas: 5 })).toBe(
      'Max time — Area 1 3:00 · Area 2 not set · Area 3 not set · Area 4 not set · Area 5 not set'
    );
  });

  it('refuses to let a nonsense area count run off the page', () => {
    const label = formatClassTimeLimits({ ...base, timeLimitSeconds: 180, numAreas: 400 });
    expect(label).toContain('Area 10 not set');
    expect(label).not.toContain('Area 11');
  });

  it('says nothing at all when no limit is configured', () => {
    // Silence beats a confident "Max time 0:00" on a page a judge runs on.
    expect(formatClassTimeLimits(base)).toBeUndefined();
    expect(formatClassTimeLimits({ ...base, timeLimitSeconds: 0 })).toBeUndefined();
  });
});

/**
 * MYK9-228. A show is the whole event; a trial is a unit inside it, and a day
 * can hold more than one. The packet was whole-show, which is wrong for a
 * nightly trigger: regenerating it each evening reprints the previous day's
 * spent pages and manufactures two near-identical stacks — the confusion the
 * packet's own recovery page warns about.
 */
describe('splitPacketInputByTrialDay', () => {
  const show = {
    id: 'show-1',
    name: 'Heartland Scent Work Classic',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
  };

  function trial(id: string, date: string, name: string) {
    return { id, date, name, trialNumber: name, registryId: 'AKC' };
  }
  function cls(id: string, trialId: string) {
    return {
      id,
      trialId,
      name: `Class ${id}`,
      element: 'Container',
      level: 'Novice',
      section: null,
      classNumber: null,
      displayOrder: 1,
      judgeName: 'Judge',
      ringLabel: null,
      startTime: null,
      timeLimitSeconds: 120,
      timeLimitArea2Seconds: null,
      timeLimitArea3Seconds: null,
      numAreas: null,
    };
  }

  // Saturday holds one trial; Sunday holds three, as the seeded Heartland show
  // does — and those three carry different sanctioning bodies.
  const input = {
    generatedAt: '2026-08-01T00:00:00.000Z',
    show,
    trials: [
      trial('t-sat', '2026-08-01', 'Saturday Trial'),
      trial('t-sun-akc', '2026-08-02', 'Sunday Trial'),
      trial('t-sun-ukc', '2026-08-02', 'Sunday UKC Nosework'),
      trial('t-sun-asca', '2026-08-02', 'Sunday ASCA Scent Detection'),
    ],
    classes: [cls('c-sat', 't-sat'), cls('c-sun-akc', 't-sun-akc'), cls('c-sun-ukc', 't-sun-ukc')],
    entries: [
      entry({ id: 'e-sat', classId: 'c-sat', trialId: 't-sat' }),
      entry({ id: 'e-sun-akc', classId: 'c-sun-akc', trialId: 't-sun-akc' }),
      entry({ id: 'e-sun-ukc', classId: 'c-sun-ukc', trialId: 't-sun-ukc' }),
    ],
  } as unknown as EmergencyPacketInput;

  it('emits one packet per day, in date order, not one per trial', () => {
    const days = splitPacketInputByTrialDay(input);
    expect(days.map(day => day.trialDate)).toEqual(['2026-08-01', '2026-08-02']);
    // Sunday's three trials belong in ONE packet: three links in one email is
    // three print jobs and three things to mislay. Within the day they keep
    // `compareTrials`' existing order (by trial number), not input order.
    expect(days[1].input.trials.map(t => t.id)).toEqual(['t-sun-asca', 't-sun-akc', 't-sun-ukc']);
  });

  it('carries only the classes and entries belonging to that day', () => {
    const [saturday, sunday] = splitPacketInputByTrialDay(input);
    expect(saturday.input.classes.map(c => c.id)).toEqual(['c-sat']);
    expect(saturday.input.entries.map(e => e.id)).toEqual(['e-sat']);
    expect(sunday.input.classes.map(c => c.id)).toEqual(['c-sun-akc', 'c-sun-ukc']);
    expect(sunday.input.entries.map(e => e.id)).toEqual(['e-sun-akc', 'e-sun-ukc']);
  });

  it('keeps an entry reachable only by trialId, with no class of its own', () => {
    // The model builder matches entries by trialId OR classId; the partition
    // must not be stricter than the thing it feeds, or entries vanish.
    const orphan = entry({ id: 'e-orphan', trialId: 't-sat' });
    const days = splitPacketInputByTrialDay({ ...input, entries: [...input.entries, orphan] });
    expect(days[0].input.entries.map(e => e.id)).toContain('e-orphan');
  });

  it('preserves generatedAt and the show across every day', () => {
    for (const day of splitPacketInputByTrialDay(input)) {
      expect(day.input.generatedAt).toBe(input.generatedAt);
      expect(day.input.show).toEqual(show);
    }
  });

  it('returns nothing for a show with no trials', () => {
    expect(splitPacketInputByTrialDay({ ...input, trials: [], classes: [], entries: [] })).toEqual(
      []
    );
  });
});

/**
 * MYK9-228 phase 2. The packet module carries its own copy of the seconds
 * formatter so it has no workspace imports and a Deno edge function can read
 * it verbatim. A copy that can drift is worse than an import, so pin the two
 * together here — this test is the reason the duplicate is allowed to exist.
 */
describe('packet seconds formatter mirrors @myk9/core', () => {
  it('agrees with formatTimeLimitSeconds across the values a class can carry', () => {
    const cases = [null, undefined, 0, 1, 30, 59, 60, 61, 90, 120, 150, 180, 240, 3599, 3600];
    for (const seconds of cases) {
      // Reached through the public surface: a single-area class renders
      // "Max time <formatted>".
      const label = formatClassTimeLimits({
        timeLimitSeconds: seconds ?? null,
        timeLimitArea2Seconds: null,
        timeLimitArea3Seconds: null,
        numAreas: null,
      });
      const expected = formatTimeLimitSeconds(seconds);
      expect(label ?? '').toBe(expected === '' ? '' : `Max time ${expected}`);
    }
  });
});
