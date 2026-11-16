import { describe, expect, it } from 'vitest';

import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';

import {
  buildReadyForShowDay,
  daysUntilShowStart,
  isReadyForShowDayWindow,
  rollUpFirstDayPaperwork,
  type FirstDayPaperwork,
  type ReadyForShowDayInput,
} from '../readyForShowDay';
import type { SecretaryCockpitPaperwork } from '../secretaryCockpitTypes';

const NY = 'America/New_York';

describe('isReadyForShowDayWindow', () => {
  const startDate = '2026-10-20';
  const at = (iso: string) =>
    isReadyForShowDayWindow({ startDate, now: new Date(iso), timeZone: NY });

  it('hides 8 days out, shows 7 and 1 day out, hides on the start day and after', () => {
    expect(at('2026-10-12T16:00:00Z')).toBe(false); // day -8
    expect(at('2026-10-13T16:00:00Z')).toBe(true); // day -7
    expect(at('2026-10-19T16:00:00Z')).toBe(true); // day -1
    expect(at('2026-10-20T16:00:00Z')).toBe(false); // day 0
    expect(at('2026-10-25T16:00:00Z')).toBe(false); // past
  });

  it('counts days on the show calendar, not UTC', () => {
    // 03:00 UTC on the 20th is still the 19th in New York: one day out.
    expect(at('2026-10-20T03:00:00Z')).toBe(true);
    // 05:00 UTC on the 20th is midnight in New York: the start day.
    expect(at('2026-10-20T05:00:00Z')).toBe(false);
  });

  it('is hidden without a readable start date', () => {
    expect(isReadyForShowDayWindow({ startDate: '', now: new Date(), timeZone: NY })).toBe(false);
    expect(isReadyForShowDayWindow({ startDate: undefined, now: new Date(), timeZone: NY })).toBe(
      false
    );
    expect(daysUntilShowStart('nope', '2026-10-13')).toBeNull();
  });
});

function fp(overrides: Partial<FirstDayPaperwork> = {}): FirstDayPaperwork {
  return {
    status: 'fail',
    kind: 'not-printed',
    sheets: 1,
    judgePackets: 1,
    labelDogs: 0,
    changedClassNames: [],
    printedAt: null,
    firstTrial: { id: 't1', dayNumber: 1, date: '2026-10-20', timeZone: NY },
    laterTrials: [],
    ...overrides,
  };
}

function sheet(
  reportId: string,
  state: SecretaryCockpitPaperwork['state']
): SecretaryCockpitPaperwork {
  return { reportId, label: reportId, state };
}

describe('rollUpFirstDayPaperwork', () => {
  const trials = [
    { id: 't1', trialDate: '2026-10-20' },
    { id: 't2', trialDate: '2026-10-21' },
  ];
  const classes = [
    { id: 'c1', trialId: 't1' },
    { id: 'c2', trialId: 't2' },
  ];
  const roll = (rows: Record<string, SecretaryCockpitPaperwork[]>, available = true) =>
    rollUpFirstDayPaperwork({
      trials,
      classes,
      byClassId: new Map(Object.entries(rows)),
      available,
    });

  it('passes when the first trial sheets are current, ignoring later days', () => {
    const result = roll({
      c1: [sheet('check-in-sheet', 'current'), sheet('scoresheet', 'current')],
      c2: [sheet('check-in-sheet', 'unconfirmed')],
    });
    expect(result).toMatchObject({ status: 'pass', kind: 'printed', sheets: 0, labelDogs: 0 });
  });

  it('fails on unconfirmed or stale first-day sheets and counts them', () => {
    const result = roll({
      c1: [sheet('check-in-sheet', 'unconfirmed'), sheet('scoresheet', 'stale')],
    });
    expect(result).toMatchObject({ status: 'fail', sheets: 2, labelDogs: 0 });
  });

  it('measures sheets for the first trial only and labels for the whole first day', () => {
    const sameDay = [
      { id: 't1', trialDate: '2026-10-20' },
      { id: 't1b', trialDate: '2026-10-20' },
      { id: 't2', trialDate: '2026-10-21' },
    ];
    const result = rollUpFirstDayPaperwork({
      trials: sameDay,
      classes: [
        { id: 'c1', trialId: 't1' },
        { id: 'c1b', trialId: 't1b' },
        { id: 'c2', trialId: 't2' },
      ],
      dogsByClassId: new Map([
        ['c1b', 4],
        ['c2', 9],
      ]),
      byClassId: new Map([
        ['c1', [sheet('check-in-sheet', 'current'), sheet('armband-labels', 'current')]],
        // Trial 2 of the day prints after move-ups: its sheets are not measured, its labels are.
        ['c1b', [sheet('check-in-sheet', 'unconfirmed'), sheet('armband-labels', 'stale')]],
        ['c2', [sheet('armband-labels', 'unconfirmed')]],
      ]),
      available: true,
    });
    expect(result).toMatchObject({ status: 'fail', sheets: 0, labelDogs: 4 });
  });

  it('never counts unknown as printed', () => {
    expect(roll({ c1: [sheet('check-in-sheet', 'unknown')] }).status).toBe('unknown');
    expect(roll({ c1: [sheet('check-in-sheet', 'current')] }, false).status).toBe('unknown');
  });

  it('ignores after-scoring sheets', () => {
    expect(roll({ c1: [sheet('results-sheet', 'unconfirmed')] }).status).toBe('pass');
  });
});

function show(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Fall Trial',
    organization: 'AKC',
    startDate: '2026-10-20',
    endDate: '2026-10-21',
    location: 'Louisville, KY',
    clubName: 'Calm Canine Club',
    status: 'published',
    ...overrides,
  } as Show;
}

const trial = { id: 't1', trialDate: '2026-10-20' } as SyncableTrial;

function allGood(overrides: Partial<ReadyForShowDayInput> = {}): ReadyForShowDayInput {
  return {
    setup: { show: show(), trials: [trial], classes: [{ judgeName: 'Jane Smith' }] },
    premiumInfo: {
      publishedPremiumUrl: 'https://example.com/p.pdf',
      publishedPremiumAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      experienceIsPublished: true,
    },
    entryBreakdownByClassId: new Map([['c1', { entered: 5, pending: 0 }]]),
    paperwork: fp({ status: 'pass', sheets: 0, labelDogs: 0 }),
    printTrackingInUse: true,
    offline: { ready: true, missing: [], asOf: 1 },
    ...overrides,
  };
}

const statusOf = (result: ReturnType<typeof buildReadyForShowDay>, id: string) =>
  result.lines.find(line => line.id === id)?.status;

describe('buildReadyForShowDay', () => {
  it('is all clear when every check passes', () => {
    const result = buildReadyForShowDay(allGood());
    expect(result.allClear).toBe(true);
    expect(result.lines.map(line => line.status)).toEqual(Array(7).fill('pass'));
  });

  it('fails each setup check with a link to its fix', () => {
    const result = buildReadyForShowDay(
      allGood({
        setup: {
          show: show({ status: 'draft' }),
          trials: [trial],
          classes: [{ judgeName: '' }],
        },
        premiumInfo: {
          publishedPremiumUrl: null,
          publishedPremiumAt: null,
          experienceIsPublished: false,
        },
      })
    );
    expect(result.allClear).toBe(false);
    for (const id of ['judges', 'premium', 'visible']) {
      const line = result.lines.find(candidate => candidate.id === id);
      expect(line?.status).toBe('fail');
      expect(line?.href).toBeTruthy();
    }
  });

  it('fails entries with the review link when any are pending', () => {
    const result = buildReadyForShowDay(
      allGood({ entryBreakdownByClassId: new Map([['c1', { entered: 3, pending: 2 }]]) })
    );
    const line = result.lines.find(candidate => candidate.id === 'entries');
    expect(line?.status).toBe('fail');
    expect(line?.detail).toBe('2 entries are waiting for review');
    expect(line?.href).toContain('/shows/show-1');
  });

  it('treats unreadable sources as unknown, never as pass', () => {
    const result = buildReadyForShowDay(
      allGood({
        premiumInfo: null,
        entryBreakdownByClassId: undefined,
        paperwork: fp({ status: 'unknown', sheets: 0, labelDogs: 0 }),
        offline: null,
      })
    );
    expect(result.allClear).toBe(false);
    for (const id of ['premium', 'entries', 'paperwork', 'offline']) {
      expect(statusOf(result, id)).toBe('unknown');
    }
  });

  it('states whose device the offline line describes', () => {
    const result = buildReadyForShowDay(
      allGood({ offline: { ready: false, missing: ['classes'], asOf: null } })
    );
    const line = result.lines.find(candidate => candidate.id === 'offline');
    expect(line?.label).toMatch(/^This device/);
    expect(line?.status).toBe('fail');
  });

  it('does not fail the offline line before the prompt window opens', () => {
    const offline = { ready: false, missing: ['classes'], asOf: null };
    const before = buildReadyForShowDay(allGood({ offline, offlinePromptOpen: false }));
    const line = before.lines.find(candidate => candidate.id === 'offline');
    expect(line?.status).toBe('unknown');
    expect(line?.detail).toMatch(/closer to show day/);
    expect(before.allClear).toBe(false);
    expect(
      statusOf(buildReadyForShowDay(allGood({ offline, offlinePromptOpen: true })), 'offline')
    ).toBe('fail');
  });

  it('links failing paperwork to the first day of the Overview', () => {
    const result = buildReadyForShowDay(
      allGood({ paperwork: fp({ status: 'fail', sheets: 3, labelDogs: 0 }) })
    );
    const line = result.lines.find(candidate => candidate.id === 'paperwork');
    // The packet panel opens on the first trial of the first day (MYK9-1924).
    expect(line?.href).toBe('/shows/show-1?day=2026-10-20&packet=t1');
    expect(line?.label).toBe("First trial's paperwork printed");
    expect(line?.detail).toBe('Trial 1 on Tuesday: 1 judge packet to print.');
    expect(line?.linkLabel).toBe('Print for Tuesday');
  });

  it('opens the packet of the first trial of the first day, not a later day', () => {
    const later = { id: 't0', trialDate: '2026-10-21' } as SyncableTrial;
    const sameDay = { id: 't2', trialDate: '2026-10-20' } as SyncableTrial;
    const result = buildReadyForShowDay(
      allGood({
        paperwork: fp({ status: 'fail', sheets: 3, labelDogs: 0 }),
        setup: { show: show(), trials: [later, trial, sameDay], classes: [{ judgeName: 'Jane' }] },
      })
    );
    expect(result.lines.find(line => line.id === 'paperwork')?.href).toContain('packet=t1');
  });

  it('omits the paperwork line, rather than passing it, while print tracking is unused (MYK9-1620)', () => {
    const result = buildReadyForShowDay(
      allGood({
        paperwork: fp({ status: 'fail', sheets: 3, labelDogs: 0 }),
        printTrackingInUse: false,
      })
    );
    expect(result.lines.map(line => line.id)).not.toContain('paperwork');
    expect(result.allClear).toBe(true);
  });

  describe('show uses switches (MYK9-1686)', () => {
    const premiumInfo = (over: Record<string, unknown>) => ({
      publishedPremiumUrl: 'https://example.com/p.pdf',
      publishedPremiumAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      experienceIsPublished: true,
      ...over,
    });
    const withShow = (showOver: Partial<Show>, info: ReturnType<typeof premiumInfo>) => {
      const base = allGood();
      return buildReadyForShowDay({
        ...base,
        setup: { ...base.setup, show: show(showOver) },
        premiumInfo: info,
      });
    };

    it('does not fail the premium line on an unpublished landing page while the switch is off', () => {
      const info = premiumInfo({ experienceIsPublished: false });
      expect(statusOf(withShow({ usesLandingPage: false }, info), 'premium')).toBe('pass');
      expect(statusOf(withShow({ usesLandingPage: true }, info), 'premium')).toBe('fail');
    });

    // MYK9-1622: a club that publishes its own premium gets no myK9 premium line at all, not a
    // passing one; the landing page, when the show uses one, is checked on its own line.
    const unpublished = { publishedPremiumUrl: null, publishedPremiumAt: null };
    const lineIds = (result: ReturnType<typeof buildReadyForShowDay>) =>
      result.lines.map(line => line.id);
    const lineFor = (result: ReturnType<typeof buildReadyForShowDay>, id: string) =>
      result.lines.find(line => line.id === id);

    it('omits the premium line when the club publishes its own and there is no landing page', () => {
      const result = withShow(
        { publishesOwnPremium: true, usesLandingPage: false },
        premiumInfo(unpublished)
      );
      expect(lineIds(result)).not.toContain('premium');
      expect(lineIds(result)).not.toContain('landing');
      expect(result.lines.some(line => /premium/i.test(line.label))).toBe(false);
      expect(result.allClear).toBe(true);
    });

    it('checks the landing page on its own line when the club publishes its own premium', () => {
      const failing = withShow(
        { publishesOwnPremium: true, usesLandingPage: true },
        premiumInfo({ ...unpublished, experienceIsPublished: false })
      );
      expect(lineIds(failing)).not.toContain('premium');
      expect(lineFor(failing, 'landing')).toMatchObject({
        label: 'Landing page published',
        status: 'fail',
        detail: 'Landing page not published',
      });
      expect(lineFor(failing, 'landing')?.href).toBeTruthy();

      const passing = withShow(
        { publishesOwnPremium: true, usesLandingPage: true },
        premiumInfo({ ...unpublished, experienceIsPublished: true })
      );
      expect(lineIds(passing)).not.toContain('premium');
      expect(lineFor(passing, 'landing')?.status).toBe('pass');
    });

    it("says it can't check the landing page, never pass, when the publish read is missing", () => {
      const base = allGood();
      const result = buildReadyForShowDay({
        ...base,
        setup: {
          ...base.setup,
          show: show({ publishesOwnPremium: true, usesLandingPage: true }),
        },
        premiumInfo: null,
      });
      expect(lineIds(result)).not.toContain('premium');
      expect(lineFor(result, 'landing')?.status).toBe('unknown');
    });

    it('keeps the premium line, and no separate landing line, when myK9 publishes the premium', () => {
      for (const usesLandingPage of [true, false]) {
        const result = withShow(
          { publishesOwnPremium: false, usesLandingPage },
          premiumInfo(unpublished)
        );
        expect(lineFor(result, 'premium')).toMatchObject({
          label: 'Premium published and current',
          status: 'fail',
        });
        expect(lineIds(result)).not.toContain('landing');
      }
    });
  });
});

describe("the first trial's paperwork line, state by state (MYK9-2075)", () => {
  const trials = [
    { id: 't1', trialDate: '2026-10-20', trialNumber: 1 },
    { id: 't2', trialDate: '2026-10-20', trialNumber: '2' },
    { id: 't3', trialDate: '2026-10-21', trialNumber: '1', timezone: NY },
  ];
  const classes = [
    { id: 'c1', trialId: 't1', element: 'Interior', level: 'Advanced', judgeName: 'Ann' },
    { id: 'c2', trialId: 't1', element: 'Container', level: 'Novice', judgeName: 'Bo' },
    { id: 'c3', trialId: 't2', element: 'Buried', level: 'Novice', judgeName: 'Ann' },
  ];
  const dogsByClassId = new Map([
    ['c1', 6],
    ['c2', 5],
    ['c3', 4],
  ]);
  const lineFor = (rows: Record<string, SecretaryCockpitPaperwork[]>, available = true) => {
    const paperwork = rollUpFirstDayPaperwork({
      trials,
      classes,
      byClassId: new Map(Object.entries(rows)),
      available,
      dogsByClassId,
    });
    return buildReadyForShowDay(allGood({ paperwork })).lines.find(
      candidate => candidate.id === 'paperwork'
    );
  };
  const printed = (reportId: string, printedAt: string): SecretaryCockpitPaperwork => ({
    reportId,
    label: reportId,
    state: 'current',
    printedAt,
  });

  it('not printed: names the trial, the day, judge packets and dogs needing a label', () => {
    const line = lineFor({
      c1: [sheet('check-in-sheet', 'unconfirmed'), sheet('armband-labels', 'unconfirmed')],
      c2: [sheet('scoresheet', 'unconfirmed'), sheet('armband-labels', 'current')],
      c3: [sheet('armband-labels', 'unconfirmed')],
    });
    expect(line?.status).toBe('fail');
    // Two judges on the first trial; labels count the dogs of classes with labels to print (6 + 4).
    expect(line?.detail).toBe(
      'Trial 1 on Tuesday: 2 judge packets and 10 armband labels to print.'
    );
    expect(line?.linkLabel).toBe('Print for Tuesday');
    expect(line?.href).toContain('packet=t1');
  });

  it('changed since printing: names the classes and links to what changed', () => {
    const line = lineFor({
      c1: [sheet('check-in-sheet', 'stale'), sheet('scoresheet', 'current')],
      c2: [sheet('check-in-sheet', 'current')],
    });
    expect(line?.status).toBe('fail');
    expect(line?.detail).toBe("Interior Advanced changed after Tuesday's paperwork was printed.");
    expect(line?.linkLabel).toBe('Print what changed');
    expect(line?.href).toContain('packet=t1');
  });

  it('printed: says when in the show zone and which trials print after move-ups, with no link', () => {
    const line = lineFor({
      c1: [printed('check-in-sheet', '2026-10-19T22:15:00Z')],
      c2: [printed('scoresheet', '2026-10-19T20:00:00Z')],
    });
    expect(line?.status).toBe('pass');
    expect(line?.detail).toBe(
      'Trial 1 printed Monday at 6:15 PM. Trial 2 prints on Tuesday; Trial 1 prints on Wednesday, after move-ups.'
    );
    expect(line?.href).toBeUndefined();
    expect(line?.linkLabel).toBeUndefined();
  });

  it('printed: leaves out the second sentence when there are no later trials', () => {
    const only = rollUpFirstDayPaperwork({
      trials: [trials[0]!],
      classes: [classes[0]!],
      byClassId: new Map([['c1', [printed('check-in-sheet', '2026-10-19T22:15:00Z')]]]),
      available: true,
    });
    const line = buildReadyForShowDay(allGood({ paperwork: only })).lines.find(
      candidate => candidate.id === 'paperwork'
    );
    expect(line?.detail).toBe('Trial 1 printed Monday at 6:15 PM.');
  });

  it("can't check: says so, with no link and no guess", () => {
    const line = lineFor({ c1: [sheet('check-in-sheet', 'unknown')] });
    expect(line?.status).toBe('unknown');
    expect(line?.detail).toBe("Can't check right now");
    expect(line?.href).toBeUndefined();
    expect(lineFor({ c1: [sheet('check-in-sheet', 'current')] }, false)?.detail).toBe(
      "Can't check right now"
    );
  });

  it('takes the first trial from the day order, not the array order', () => {
    const reversed = rollUpFirstDayPaperwork({
      trials: [trials[1]!, trials[0]!],
      classes,
      byClassId: new Map([['c3', [sheet('check-in-sheet', 'unconfirmed')]]]),
      available: true,
    });
    // Trial 2 is listed first but is the second trial of the day: its sheets are not measured.
    expect(reversed.status).toBe('pass');
    expect(reversed.firstTrial?.id).toBe('t1');
  });
});
