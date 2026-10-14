import { describe, expect, it } from 'vitest';

import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';

import {
  buildReadyForShowDay,
  daysUntilShowStart,
  isReadyForShowDayWindow,
  rollUpFirstDayPaperwork,
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

  it('passes when first-day sheets are current, ignoring later days', () => {
    const result = roll({
      c1: [sheet('check-in-sheet', 'current'), sheet('scoresheet', 'current')],
      c2: [sheet('check-in-sheet', 'unconfirmed')],
    });
    expect(result).toEqual({ status: 'pass', outstanding: 0 });
  });

  it('fails on unconfirmed or stale first-day sheets and counts them', () => {
    const result = roll({
      c1: [sheet('check-in-sheet', 'unconfirmed'), sheet('scoresheet', 'stale')],
    });
    expect(result).toEqual({ status: 'fail', outstanding: 2 });
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
    paperwork: { status: 'pass', outstanding: 0 },
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
        paperwork: { status: 'unknown', outstanding: 0 },
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

  it('links failing paperwork to the first day of the Overview', () => {
    const result = buildReadyForShowDay(allGood({ paperwork: { status: 'fail', outstanding: 3 } }));
    const line = result.lines.find(candidate => candidate.id === 'paperwork');
    expect(line?.href).toBe('/shows/show-1?day=2026-10-20');
    expect(line?.detail).toBe('3 sheets for the first day need printing');
  });
});
