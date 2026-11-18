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
    labelsNotPrinted: 0,
    labelsChanged: 0,
    changedClasses: [],
    labelDoorClassId: null,
    printedAt: null,
    measured: true,
    firstTrial: { id: 't1', label: 'Trial 1', date: '2026-10-20', timeZone: NY },
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
    expect(result).toMatchObject({ status: 'pass', kind: 'printed', sheets: 0 });
  });

  it('counts unprinted and changed sheets, and never calls it changed while any is unprinted', () => {
    const result = roll({
      c1: [sheet('check-in-sheet', 'unconfirmed'), sheet('scoresheet', 'stale')],
    });
    expect(result).toMatchObject({ status: 'fail', kind: 'not-printed', sheets: 2 });
    expect(roll({ c1: [sheet('scoresheet', 'stale')] })).toMatchObject({ kind: 'changed' });
  });

  it('measures sheets for the first trial only and labels for the whole first day', () => {
    const sameDay = [
      { id: 't1', trialDate: '2026-10-20' },
      { id: 't1b', trialDate: '2026-10-20', trialNumber: '2' },
      { id: 't2', trialDate: '2026-10-21' },
    ];
    const result = rollUpFirstDayPaperwork({
      trials: sameDay,
      classes: [
        { id: 'c1', trialId: 't1' },
        { id: 'c1b', trialId: 't1b' },
        { id: 'c2', trialId: 't2' },
      ],
      byClassId: new Map([
        ['c1', [sheet('check-in-sheet', 'current'), sheet('armband-labels', 'current')]],
        // The day's second trial prints after move-ups: its sheets are not measured, its labels are.
        [
          'c1b',
          [
            sheet('check-in-sheet', 'unconfirmed'),
            {
              ...sheet('armband-labels', 'stale'),
              labelsToPrint: { notPrinted: ['k1'], changed: ['k2'] },
            },
          ],
        ],
        [
          'c2',
          [
            {
              ...sheet('armband-labels', 'unconfirmed'),
              labelsToPrint: { notPrinted: ['k3'], changed: [] },
            },
          ],
        ],
      ]),
      available: true,
    });
    expect(result).toMatchObject({
      status: 'fail',
      sheets: 0,
      labelsNotPrinted: 1,
      labelsChanged: 1,
      labelDoorClassId: 'c1b',
    });
  });

  it('counts a dog once across classes, and as new when it is also changed elsewhere', () => {
    const result = rollUpFirstDayPaperwork({
      trials: [trials[0]!],
      classes: [
        { id: 'c1', trialId: 't1' },
        { id: 'c2', trialId: 't1' },
      ],
      byClassId: new Map([
        [
          'c1',
          [
            {
              ...sheet('armband-labels', 'unconfirmed'),
              labelsToPrint: { notPrinted: ['k1'], changed: [] },
            },
          ],
        ],
        [
          'c2',
          [
            {
              ...sheet('armband-labels', 'stale'),
              labelsToPrint: { notPrinted: ['k1'], changed: ['k1', 'k2'] },
            },
          ],
        ],
      ]),
      available: true,
    });
    expect(result).toMatchObject({ labelsNotPrinted: 1, labelsChanged: 1 });
  });

  it('any unknown row in what it measures beats a fail', () => {
    const result = roll({
      c1: [sheet('check-in-sheet', 'unconfirmed'), sheet('armband-labels', 'unknown')],
    });
    expect(result).toMatchObject({ status: 'unknown', kind: 'unknown' });
    expect(roll({ c1: [sheet('check-in-sheet', 'unknown')] }).status).toBe('unknown');
    expect(roll({ c1: [sheet('check-in-sheet', 'current')] }, false).status).toBe('unknown');
  });

  it('keeps changed classes by id, so two classes with one name stay two', () => {
    const result = rollUpFirstDayPaperwork({
      trials: [trials[0]!],
      classes: [
        { id: 'c1', trialId: 't1', element: 'Interior', level: 'Novice' },
        { id: 'c2', trialId: 't1', element: 'Interior', level: 'Novice' },
      ],
      byClassId: new Map([
        ['c1', [sheet('scoresheet', 'stale')]],
        ['c2', [sheet('scoresheet', 'stale')]],
      ]),
      available: true,
    });
    expect(result.changedClasses).toHaveLength(2);
  });

  it('folds and trims judge names for the packet count', () => {
    const result = rollUpFirstDayPaperwork({
      trials: [trials[0]!],
      classes: [
        { id: 'c1', trialId: 't1', judgeName: 'Ann Lee' },
        { id: 'c2', trialId: 't1', judgeName: ' ann lee ' },
      ],
      byClassId: new Map([
        ['c1', [sheet('scoresheet', 'unconfirmed')]],
        ['c2', [sheet('scoresheet', 'unconfirmed')]],
      ]),
      available: true,
    });
    expect(result.judgePackets).toBe(1);
  });

  it('ignores after-scoring sheets', () => {
    expect(roll({ c1: [sheet('results-sheet', 'unconfirmed')] }).status).toBe('pass');
  });

  it('takes the first trial from the day order, with a numeric trial_number from a fixture', () => {
    const result = rollUpFirstDayPaperwork({
      trials: [
        { id: 'late', trialDate: '2026-10-20', trialNumber: 2 },
        { id: 'early', trialDate: '2026-10-20', trialNumber: 1 },
      ],
      classes: [{ id: 'c', trialId: 'late' }],
      byClassId: new Map([['c', [sheet('check-in-sheet', 'unconfirmed')]]]),
      available: true,
    });
    expect(result.firstTrial?.id).toBe('early');
    expect(result.status).toBe('pass');
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
    paperwork: fp({ status: 'pass', sheets: 0 }),
    printTrackingInUse: true,
    offline: { ready: true, missing: [], asOf: 1 },
    ...overrides,
  };
}

const statusOf = (result: ReturnType<typeof buildReadyForShowDay>, id: string) =>
  result.lines.find(line => line.id === id)?.status;

describe('buildReadyForShowDay', () => {
  describe('club payouts line (MYK9-2164)', () => {
    const withPayouts = (payouts: NonNullable<ReadyForShowDayInput['setup']['payouts']>) =>
      buildReadyForShowDay(
        allGood({
          setup: {
            show: show({ clubId: 'club-9' }),
            trials: [trial],
            classes: [{ judgeName: 'Jane Smith' }],
            payouts,
          },
        })
      );
    const line = (result: ReturnType<typeof buildReadyForShowDay>) =>
      result.lines.find(l => l.id === 'payouts');

    it('adds no line when the state was not supplied', () => {
      expect(line(buildReadyForShowDay(allGood()))).toBeUndefined();
    });

    it('adds no line for a demo club', () => {
      expect(line(withPayouts('demo'))).toBeUndefined();
    });

    it.each(['ready'] as const)('passes for %s', state => {
      expect(line(withPayouts(state))?.status).toBe('pass');
    });

    it.each(['not-connected', 'incomplete', 'in-review'] as const)(
      'fails for %s, linking the club Payments tab',
      state => {
        expect(line(withPayouts(state))).toMatchObject({
          status: 'fail',
          href: '/clubs/club-9?tab=payments',
        });
        expect(withPayouts(state).allClear).toBe(false);
      }
    );

    it('is "can\'t check", not a failure, while the state is unknown', () => {
      expect(line(withPayouts('unknown'))).toMatchObject({
        status: 'unknown',
        detail: "Can't check right now",
      });
    });
  });

  it('is all clear when every check passes', () => {
    const result = buildReadyForShowDay(allGood());
    expect(result.allClear).toBe(true);
    expect(result.lines.map(line => line.status)).toEqual(Array(7).fill('pass'));
  });

  it('fails the premium line, linking the premium card, when required facts are empty (MYK9-2053)', () => {
    const result = buildReadyForShowDay(
      allGood({
        setup: {
          show: show(),
          trials: [trial],
          classes: [{ judgeName: 'Jane Smith' }],
          premiumMissingFacts: 2,
        },
      })
    );
    const line = result.lines.find(l => l.id === 'premium');
    expect(line).toMatchObject({
      status: 'fail',
      detail: 'Premium list is missing required facts',
      href: '#setup-publish-premium',
    });
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
        paperwork: fp({ status: 'unknown', sheets: 0 }),
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
    const result = buildReadyForShowDay(allGood({ paperwork: fp({ status: 'fail', sheets: 3 }) }));
    const line = result.lines.find(candidate => candidate.id === 'paperwork');
    // The packet panel opens on the first trial of the first day (MYK9-1924).
    expect(line?.href).toBe('/shows/show-1?day=2026-10-20&packet=t1');
    expect(line?.label).toBe("First trial's paperwork printed");
    expect(line?.detail).toBe('Trial 1 on Tuesday: 1 judge packet to print.');
    expect(line?.linkLabel).toBe('Print for Tuesday');
  });

  it('omits the paperwork line, rather than passing it, while print tracking is unused (MYK9-1620)', () => {
    const result = buildReadyForShowDay(
      allGood({
        paperwork: fp({ status: 'fail', sheets: 3 }),
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
  const lineOf = (paperwork: FirstDayPaperwork) =>
    buildReadyForShowDay(allGood({ paperwork })).lines.find(
      candidate => candidate.id === 'paperwork'
    );

  it('not printed: names the trial, the day, judge packets and labels; links to the packet', () => {
    const line = lineOf(fp({ sheets: 3, judgePackets: 2, labelsNotPrinted: 10 }));
    expect(line?.detail).toBe(
      'Trial 1 on Tuesday: 2 judge packets and 10 armband labels to print.'
    );
    expect(line?.linkLabel).toBe('Print for Tuesday');
    expect(line?.href).toBe('/shows/show-1?day=2026-10-20&packet=t1');
  });

  it("not printed, only labels: the link goes to the day's labels, not the packet", () => {
    const line = lineOf(
      fp({ sheets: 0, judgePackets: 0, labelsNotPrinted: 4, labelDoorClassId: 'c9' })
    );
    expect(line?.detail).toBe('Tuesday: 4 armband labels to print.');
    expect(line?.linkLabel).toBe('Print labels for Tuesday');
    expect(line?.href).toBe('/shows/show-1?day=2026-10-20&focus=c9');
  });

  it('not printed with changes: still names what changed', () => {
    const line = lineOf(
      fp({ sheets: 2, labelsChanged: 1, changedClasses: [{ id: 'a', name: 'Interior Advanced' }] })
    );
    expect(line?.detail).toBe(
      'Trial 1 on Tuesday: 1 judge packet and 1 armband label to print. Changed since printing: Interior Advanced and 1 armband label.'
    );
  });

  it('changed since printing: names the classes and goes where the changes print', () => {
    const sheets = lineOf(
      fp({ kind: 'changed', sheets: 1, changedClasses: [{ id: 'a', name: 'Interior Advanced' }] })
    );
    expect(sheets?.detail).toBe("Interior Advanced changed after Tuesday's paperwork was printed.");
    expect(sheets?.linkLabel).toBe('Print what changed');
    expect(sheets?.href).toContain('packet=t1');
    const labels = lineOf(
      fp({ kind: 'changed', sheets: 0, labelsChanged: 2, labelDoorClassId: 'c9' })
    );
    expect(labels?.detail).toBe("2 armband labels changed after Tuesday's paperwork was printed.");
    expect(labels?.href).toBe('/shows/show-1?day=2026-10-20&focus=c9');
  });

  it('printed: the time in the show zone and the later trials, with no link', () => {
    const line = lineOf(
      fp({
        status: 'pass',
        kind: 'printed',
        sheets: 0,
        printedAt: '2026-10-19T22:15:00Z',
        laterTrials: [
          { label: 'Trial 2', date: '2026-10-21' },
          { label: 'Trial 3', date: '2026-10-21' },
        ],
      })
    );
    expect(line?.status).toBe('pass');
    expect(line?.detail).toBe(
      'Trial 1 printed Monday at 6:15 PM. Trial 2 and Trial 3 print on Wednesday, after move-ups.'
    );
    expect(line?.href).toBeUndefined();
    expect(line?.linkLabel).toBeUndefined();
  });

  it('printed: no second sentence without later trials; no time phrase when it is unreadable', () => {
    const pass = { status: 'pass', kind: 'printed', sheets: 0 } as const;
    expect(lineOf(fp({ ...pass, printedAt: '2026-10-19T22:15:00Z' }))?.detail).toBe(
      'Trial 1 printed Monday at 6:15 PM.'
    );
    expect(lineOf(fp({ ...pass, printedAt: 'not a time' }))?.detail).toBe('Trial 1 is printed.');
    expect(lineOf(fp({ ...pass, printedAt: null }))?.detail).toBe('Trial 1 is printed.');
  });

  it('printed with nothing measured: says there is nothing to print, never "printed"', () => {
    const line = lineOf(fp({ status: 'pass', kind: 'printed', sheets: 0, measured: false }));
    expect(line?.detail).toBe('Trial 1 has nothing to print.');
  });

  it('a bad trial date never yields a stray possessive', () => {
    const bad = { id: 't1', label: 'Trial 1', date: 'nope', timeZone: NY };
    const line = lineOf(
      fp({ kind: 'changed', changedClasses: [{ id: 'a', name: 'Interior' }], firstTrial: bad })
    );
    expect(line?.detail).toBe('Interior changed after the paperwork was printed.');
  });

  it("can't check: says so, with no link and no guess", () => {
    const line = lineOf(fp({ status: 'unknown', kind: 'unknown' }));
    expect(line?.status).toBe('unknown');
    expect(line?.detail).toBe("Can't check right now");
    expect(line?.href).toBeUndefined();
  });
});
