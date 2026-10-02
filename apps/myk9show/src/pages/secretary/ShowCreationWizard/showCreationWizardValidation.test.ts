/**
 * F6 — choosing the show's own start date as the entry-close date (normal for a
 * day-of-entry show) always failed with "Entry close date must be on or before the
 * show start date".
 *
 * The comparison was already date-only, but it sliced the first 10 characters off an
 * ISO *UTC* string. The picker defaults the close time to 11:59 PM local and emits
 * `date.toISOString()`, so west of UTC that serialises to the NEXT calendar day:
 * "Aug 29 11:59 PM CDT" -> "2026-08-30T04:59:00.000Z" -> "2026-08-30". Compared
 * against a show start of 8:00 AM the same day, close > start and the rule fired.
 */
import { describe, expect, it } from 'vitest';
import {
  getReviewBlockingErrors,
  getValidationScope,
  getShowDetailsValidationMessages,
  getTrialValidationMessages,
  getValidationMessagesForStep,
} from './showCreationWizardValidation';

const CLOSE_RULE = 'Entry close date must be on or before the show start date';

// Local wall-clock times, serialised the way DateRangePicker does.
const localIso = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m - 1, d, h, min, 0).toISOString();

function baseShow(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Audit Show',
    organization: 'AKC',
    location: 'Somewhere',
    clubId: 'club-1',
    officials: { chairman: ['p1'], secretary: ['p2'] },
    startDate: localIso(2026, 8, 29, 8, 0),
    endDate: localIso(2026, 8, 30, 17, 0),
    entryOpenDate: localIso(2026, 8, 1, 8, 0),
    entryCloseDate: localIso(2026, 8, 29, 23, 59),
    ...overrides,
  } as Parameters<typeof getShowDetailsValidationMessages>[0];
}

describe('getShowDetailsValidationMessages — junior handler fee bound', () => {
  const RULE = 'Junior handler fee must be less than $100,000';

  it.each([
    [99999.99, false],
    [100000, true],
    [1e21, true],
  ])('a fee of %s blocks the step: %s', (fee, blocked) => {
    const messages = getShowDetailsValidationMessages(baseShow({ juniorHandlerFee: fee }));
    expect(messages.includes(RULE)).toBe(blocked);
  });

  it('ignores a stale over-limit fee on an ASCA show, which hides the field', () => {
    const show = baseShow({ organization: 'ASCA', juniorHandlerFee: 100000 });
    expect(getShowDetailsValidationMessages(show)).not.toContain(RULE);
  });

  it('does not block an unset fee', () => {
    expect(getShowDetailsValidationMessages(baseShow())).not.toContain(RULE);
  });
});

describe('getShowDetailsValidationMessages — entry close vs show start', () => {
  it('accepts entries closing at 11:59 PM on the show start date (day-of entry)', () => {
    expect(getShowDetailsValidationMessages(baseShow())).not.toContain(CLOSE_RULE);
  });

  it('still rejects an entry close after the show start date', () => {
    const show = baseShow({ entryCloseDate: localIso(2026, 8, 30, 9, 0) });
    expect(getShowDetailsValidationMessages(show)).toContain(CLOSE_RULE);
  });

  it('accepts an entry close comfortably before the show', () => {
    const show = baseShow({ entryCloseDate: localIso(2026, 8, 20, 23, 59) });
    expect(getShowDetailsValidationMessages(show)).not.toContain(CLOSE_RULE);
  });

  it('still rejects an entry close before the entry open date', () => {
    const show = baseShow({
      entryOpenDate: localIso(2026, 8, 20, 8, 0),
      entryCloseDate: localIso(2026, 8, 10, 23, 59),
    });
    expect(getShowDetailsValidationMessages(show)).toContain(
      'Entry close date must be on or after entry open date'
    );
  });

  it('still rejects an end date before the start date', () => {
    // 9:00 AM, deliberately NOT 5:00 PM: in America/Los_Angeles 5:00 PM local is
    // exactly UTC midnight, which collides with the known limitation pinned below.
    const show = baseShow({ endDate: localIso(2026, 8, 28, 9, 0) });
    expect(getShowDetailsValidationMessages(show)).toContain(
      'End date must be on or after start date'
    );
  });

  it('KNOWN LIMITATION (F35): a local time that is exactly UTC midnight reads as the next day', () => {
    // toLocalDateOnly short-circuits any ISO string ending T00:00:00Z to its literal
    // date part, because a DATE column round-trips that way and local getters would
    // misread it as the previous day. A genuine local timestamp that happens to land
    // on UTC midnight -- 5:00 PM PDT, 7:00 PM EST, a perfectly ordinary show end
    // time -- is indistinguishable from that, so it resolves one day late.
    //
    // This is PRE-EXISTING and not a regression: the old slice(0, 10) produced the
    // same answer for the same input (verified). Pinned here so the limitation is
    // visible rather than folded into an unrelated assertion. Fixing it needs the
    // wizard to carry date-only values instead of ISO datetimes.
    const utcMidnightLocal = new Date(Date.UTC(2026, 7, 29, 0, 0, 0)).toISOString();
    const offsetMinutes = new Date(2026, 7, 28).getTimezoneOffset();
    const show = baseShow({ endDate: utcMidnightLocal });
    const messages = getShowDetailsValidationMessages(show);
    if (offsetMinutes > 0) {
      // West of UTC: the local calendar day is Aug 28, so end-before-start SHOULD
      // fire; it does not, because the value is read as Aug 29.
      expect(messages).not.toContain('End date must be on or after start date');
    } else {
      expect(messages).not.toContain('End date must be on or after start date');
    }
  });
});

describe('class-selection step registry validation', () => {
  it('refuses a cloned foreign-registry class before advancing to review', () => {
    const show = baseShow();
    const trials = [
      {
        id: 'trial-1',
        dateTime: '2026-08-29T08:00:00',
        eventNumber: 'EVT-1',
        trialType: 'scent_work',
        classes: [
          {
            templateId: 'template-1',
            customizations: {
              className: 'Container Master B',
              element: 'Container',
              level: 'Master',
              section: 'B',
            },
          },
        ],
      },
    ];
    const trialView = {
      effectiveNamesByTrialId: new Map([['trial-1', 'Saturday Trial 1']]),
      persistedTrialCount: 0,
      hasAnyTrials: true,
    };

    expect(getValidationMessagesForStep(2, show, trials, trialView).join(' ')).toMatch(
      /Container Master B.*AKC registry/i
    );
  });
});

describe('class step - which trials must have classes (MYK9-899)', () => {
  const klass = {
    templateId: 'template-1',
    customizations: {
      className: 'Container Novice A',
      element: 'Container',
      level: 'Novice',
      section: 'A',
    },
  };
  const mk = (id: string, classes: unknown[]) => ({
    id,
    dateTime: '2026-08-29T08:00:00',
    eventNumber: 'EVT-1',
    trialType: 'scent_work',
    classes,
  });
  const trials = [mk('trial-a', [klass]), mk('trial-b', [])];
  const trialView = {
    effectiveNamesByTrialId: new Map([
      ['trial-a', 'Saturday'],
      ['trial-b', 'Sunday'],
    ]),
    persistedTrialCount: 0,
    hasAnyTrials: true,
  };

  it('create mode still requires every trial to have a class', () => {
    const messages = getValidationMessagesForStep(2, baseShow(), trials as never, trialView);
    expect(messages).toContain('Sunday needs at least one class');
  });

  it('add-classes mode does not block on an untouched empty trial', () => {
    const messages = getValidationMessagesForStep(
      2,
      baseShow(),
      trials as never,
      trialView,
      [],
      {},
      'class-selection'
    );
    expect(messages).toEqual([]);
  });

  it('add-classes mode still requires something to save when every trial is empty', () => {
    const messages = getValidationMessagesForStep(
      2,
      baseShow(),
      [mk('trial-a', []), mk('trial-b', [])] as never,
      trialView,
      [],
      {},
      'class-selection'
    );
    expect(messages).toContain('Please add at least one class to the trials');
  });
});

describe('validation scope: add-classes evaluates only the class rules (MYK9-899)', () => {
  // Every show-creation requirement, violated at once.
  const brokenShow = baseShow({
    name: '',
    location: '',
    clubId: '',
    startDate: '',
    endDate: '',
    entryOpenDate: '',
    entryCloseDate: '',
    officials: { chairman: [], secretary: [] },
  });
  const trial = {
    id: 'trial-1',
    dateTime: '',
    eventNumber: '',
    trialType: 'scent_work',
    classes: [
      {
        templateId: 't',
        customizations: {
          className: 'Container Novice A',
          element: 'Container',
          level: 'Novice',
          section: 'A',
        },
      },
    ],
  };
  const trialView = {
    effectiveNamesByTrialId: new Map([['trial-1', '']]),
    persistedTrialCount: 1,
    hasAnyTrials: true,
  };
  const scope = getValidationScope({ mode: 'add-classes' });

  it('maps edit modes to scopes', () => {
    expect(scope).toBe('class-selection');
    expect(getValidationScope({ mode: 'add-trials' })).toBe('full');
    expect(getValidationScope(undefined)).toBe('full');
  });

  it.each([0, 1, 2, 3])('no show-creation requirement blocks step %i', step => {
    expect(
      getValidationMessagesForStep(
        step,
        brokenShow,
        [trial] as never,
        trialView,
        [],
        { requireEntryWindow: true },
        scope
      )
    ).toEqual([]);
  });

  it('Review blocks nothing about the show; only an empty class set blocks', () => {
    expect(
      getReviewBlockingErrors({ show: brokenShow, trials: [trial], officialsUnknown: false, scope })
    ).toEqual([]);
    expect(
      getReviewBlockingErrors({
        show: brokenShow,
        trials: [{ classes: [] }],
        officialsUnknown: false,
        scope,
      })
    ).toEqual(['Please add at least one class']);
  });

  it('full scope still enforces every requirement on the same show (control)', () => {
    const messages = [
      ...getValidationMessagesForStep(0, brokenShow, [trial] as never, trialView, [], {
        requireEntryWindow: true,
      }),
      ...getReviewBlockingErrors({
        show: brokenShow,
        trials: [trial],
        officialsUnknown: false,
        scope: 'full',
      }),
    ].join(' | ');
    for (const required of [
      'Please enter a show name',
      'Please enter a location',
      'Please select a hosting club',
      'Please select a chair',
      'Please select a secretary',
      'Please select an entry open date',
    ]) {
      expect(messages).toContain(required);
    }
  });
});

// MYK9-716: a draft may have no entry window; publishing requires one. The
// Show Details step therefore lets a new draft through without entry dates
// (Review names the gap and the status pill refuses to publish), but an
// existing show that is already live keeps the window mandatory, so adding
// trials or classes to it can never clear the window a published show needs.
describe('Show Details step — entry window (MYK9-716)', () => {
  const REQUIRED = ['Please select an entry open date', 'Please select an entry close date'];
  const windowless = () => baseShow({ entryOpenDate: '', entryCloseDate: '' });
  const trialView = {
    effectiveNamesByTrialId: new Map<string, string>(),
    persistedTrialCount: 0,
    hasAnyTrials: false,
  };

  it('lets a new draft through with no entry window', () => {
    expect(getShowDetailsValidationMessages(windowless())).toEqual([]);
    expect(getValidationMessagesForStep(0, windowless(), [], trialView)).toEqual([]);
  });

  it('keeps the window mandatory when the show being edited is already live', () => {
    const messages = getValidationMessagesForStep(0, windowless(), [], trialView, [], {
      requireEntryWindow: true,
    });
    expect(messages).toEqual(expect.arrayContaining(REQUIRED));
  });

  it('still rejects a window whose close comes before its open', () => {
    const show = baseShow({
      entryOpenDate: localIso(2026, 8, 20, 8, 0),
      entryCloseDate: localIso(2026, 8, 10, 23, 59),
    });
    expect(getShowDetailsValidationMessages(show)).toContain(
      'Entry close date must be on or after entry open date'
    );
  });
});

describe('trial start time draft (MYK9-931)', () => {
  it('a blank or invalid typed start time blocks the trial step by name', () => {
    const view = {
      effectiveNamesByTrialId: new Map([['t1', 'Saturday Trial']]),
    } as unknown as Parameters<typeof getTrialValidationMessages>[1];
    const trial = (startTimeDraft?: string) =>
      [
        {
          id: 't1',
          dateTime: '2026-08-15T08:00:00',
          eventNumber: '1',
          trialType: 'Scent Work',
          classes: [],
          ...(startTimeDraft !== undefined ? { startTimeDraft } : {}),
        },
      ] as unknown as Parameters<typeof getTrialValidationMessages>[0];
    expect(getTrialValidationMessages(trial(), view, 'UKC')).toEqual([]);
    expect(getTrialValidationMessages(trial('1:30 PM'), view, 'UKC')).toEqual([]);
    expect(getTrialValidationMessages(trial(''), view, 'UKC')).toEqual([
      'Please enter a start time for Saturday Trial',
    ]);
    expect(getTrialValidationMessages(trial('soon'), view, 'UKC')).toEqual([
      'Please enter a valid start time for Saturday Trial (e.g., 9:00 AM)',
    ]);
  });
});
