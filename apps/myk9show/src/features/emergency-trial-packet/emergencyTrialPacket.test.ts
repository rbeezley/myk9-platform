import { describe, expect, it } from 'vitest';
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
      formatClassTimeLimits({ ...base, timeLimitSeconds: 180, timeLimitArea2Seconds: 120, numAreas: 1 })
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
