import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import {
  deriveJudgeInitials,
  deriveMonogram,
  toLowerRoman,
  useMagazineLandingData,
} from '../useMagazineLandingData';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [] }),
}));

describe('toLowerRoman', () => {
  it('converts small numbers to lowercase Roman numerals', () => {
    expect(toLowerRoman(1)).toBe('i');
    expect(toLowerRoman(3)).toBe('iii');
    expect(toLowerRoman(4)).toBe('iv');
    expect(toLowerRoman(6)).toBe('vi');
    expect(toLowerRoman(9)).toBe('ix');
  });

  it('returns empty string for null/undefined', () => {
    expect(toLowerRoman(null)).toBe('');
    expect(toLowerRoman(undefined)).toBe('');
  });

  it('falls back to the input when parsing fails', () => {
    expect(toLowerRoman('not-a-number')).toBe('not-a-number');
  });
});

describe('deriveMonogram', () => {
  it('takes the first letter of up to three capitalized words', () => {
    expect(deriveMonogram('Bexar County Kennel Club')).toBe('BCK');
  });

  it('falls back to the first two characters uppercased when no caps present', () => {
    expect(deriveMonogram('lone star working dog club')).toBe('LO');
  });

  it('returns a centered dot for empty club names', () => {
    expect(deriveMonogram('')).toBe('·');
    expect(deriveMonogram('   ')).toBe('·');
  });

  it('respects two-word club names', () => {
    expect(deriveMonogram('Live Oak')).toBe('LO');
  });
});

describe('deriveJudgeInitials', () => {
  it('strips honorifics and returns up to three initials', () => {
    expect(deriveJudgeInitials('Mrs. Catherine Beagles')).toBe('CB');
    expect(deriveJudgeInitials('Mr. Marcus Whitfield')).toBe('MW');
  });

  it('returns a dot when no name tokens remain', () => {
    expect(deriveJudgeInitials('')).toBe('·');
    expect(deriveJudgeInitials('Mrs.')).toBe('·');
  });

  it('handles three-token names', () => {
    expect(deriveJudgeInitials('John Quincy Adams')).toBe('JQA');
  });
});

describe('useMagazineLandingData', () => {
  it('derives the monogram from the club name', () => {
    const show = {
      id: 'show-1',
      name: 'Spring Scent Work',
      organization: 'Bexar County Kennel Club',
      startDate: '2026-06-12',
      endDate: '2026-06-14',
      preEntryFee: 25,
      experienceIsPublished: false,
      experiencePublishedContent: null,
    } as unknown as Show;

    const { result } = renderHook(() => useMagazineLandingData(show, null, []));
    expect(result.current.monogramLetters).toBe('BCK');
  });

  it('reads the cover image URL from supplemental.coverImageUrl', () => {
    const show = {
      id: 'show-1',
      name: 'Bluegrass Classic',
      organization: 'AKC Club',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      experienceIsPublished: true,
      experiencePublishedContent: {
        style: 'magazine',
        generatedAt: '2026-04-01T00:00:00Z',
        narratives: { showHours: '', trialInformation: '' },
        supplemental: {
          vetClinic: null,
          accommodations: [],
          coverImageUrl: 'https://example.com/cover.jpg',
          hospitalityNotes: null,
          awardsDescription: null,
          additionalNotes: null,
        },
        outputs: { premiumUrl: null },
      },
    } as unknown as Show;

    const { result } = renderHook(() => useMagazineLandingData(show, null, []));
    expect(result.current.coverImageUrl).toBe('https://example.com/cover.jpg');
  });

  it('returns null cover when no supplemental is published', () => {
    const show = {
      id: 'show-1',
      name: 'X',
      organization: 'Y',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      experienceIsPublished: false,
      experiencePublishedContent: null,
    } as unknown as Show;
    const { result } = renderHook(() => useMagazineLandingData(show, null, []));
    expect(result.current.coverImageUrl).toBeNull();
  });

  it('dedups judges across trials and assigns plate labels by order', () => {
    const allTrials = [
      { id: 't1', trialNumber: 1, trialDate: '2026-06-12', judge: 'Mrs. Beagles' },
      { id: 't2', trialNumber: 2, trialDate: '2026-06-12', judge: 'Mr. Whitfield' },
      { id: 't3', trialNumber: 3, trialDate: '2026-06-13', judge: 'Mrs. Beagles' },
    ] as unknown as Trial[];
    const show = {
      id: 'show-1',
      name: 'X',
      organization: 'Y',
      startDate: '2026-06-12',
      endDate: '2026-06-13',
      experienceIsPublished: false,
      experiencePublishedContent: null,
    } as unknown as Show;

    const { result } = renderHook(() => useMagazineLandingData(show, null, allTrials));
    expect(result.current.judges).toHaveLength(2);
    expect(result.current.judges[0]).toMatchObject({
      name: 'Mrs. Beagles',
      plateLabel: 'Plate I',
      initials: 'B',
      trials: ['i', 'iii'],
    });
    expect(result.current.judges[1]).toMatchObject({
      name: 'Mr. Whitfield',
      plateLabel: 'Plate II',
      initials: 'W',
      trials: ['ii'],
    });
  });

  it('formats the subtitle with registry license and trial count (plural)', () => {
    const allTrials = [
      { id: 't1', trialNumber: 1, trialDate: '2026-06-12' },
      { id: 't2', trialNumber: 2, trialDate: '2026-06-12' },
    ] as unknown as Trial[];
    const show = {
      id: 'show-1',
      name: 'X',
      organization: 'Y',
      startDate: '2026-06-12',
      endDate: '2026-06-13',
      experienceIsPublished: false,
      experiencePublishedContent: null,
    } as unknown as Show;
    const { result } = renderHook(() => useMagazineLandingData(show, null, allTrials));
    expect(result.current.showSubtitle).toBe('An A.K.C. Licensed Trial · 2 Trials');
  });

  it('singularizes "Trial" when there is exactly one', () => {
    const allTrials = [
      { id: 't1', trialNumber: 1, trialDate: '2026-06-12' },
    ] as unknown as Trial[];
    const show = {
      id: 'show-1',
      name: 'X',
      organization: 'Y',
      startDate: '2026-06-12',
      endDate: '2026-06-12',
      experienceIsPublished: false,
      experiencePublishedContent: null,
    } as unknown as Show;
    const { result } = renderHook(() => useMagazineLandingData(show, null, allTrials));
    expect(result.current.showSubtitle).toBe('An A.K.C. Licensed Trial · 1 Trial');
  });

  it('formats fees with first/day-of labels when both fees are set', () => {
    const show = {
      id: 'show-1',
      name: 'X',
      organization: 'Y',
      startDate: '2026-06-12',
      endDate: '2026-06-12',
      preEntryFee: 25,
      dayOfShowFee: 30,
      experienceIsPublished: false,
      experiencePublishedContent: null,
    } as unknown as Show;
    const { result } = renderHook(() => useMagazineLandingData(show, null, []));
    expect(result.current.fees).toEqual([
      { label: 'First entry', amount: expect.stringContaining('25') },
      { label: 'Day-of entry', amount: expect.stringContaining('30') },
    ]);
  });

  it('returns null pull quote when supplemental does not provide one', () => {
    const show = {
      id: 'show-1',
      name: 'X',
      organization: 'Y',
      startDate: '2026-06-12',
      endDate: '2026-06-12',
      experienceIsPublished: false,
      experiencePublishedContent: null,
    } as unknown as Show;
    const { result } = renderHook(() => useMagazineLandingData(show, null, []));
    expect(result.current.pullQuote).toBeNull();
    expect(result.current.pullQuoteAttribution).toBeNull();
  });

  it('reads forward-compatible pullQuote/pullQuoteAttribution from supplemental when present', () => {
    // `pullQuote` / `pullQuoteAttribution` are not declared on the
    // PremiumSupplemental type today; the hook reads them via a runtime
    // shape check. The whole `show` object is built with an `as unknown as Show`
    // escape at the bottom anyway, so the fixture can just include the
    // forward-typed fields without extra casts — the outer `Show` cast
    // covers them.
    const show = {
      id: 'show-1',
      name: 'X',
      organization: 'Y',
      startDate: '2026-06-12',
      endDate: '2026-06-12',
      experienceIsPublished: true,
      experiencePublishedContent: {
        style: 'magazine',
        generatedAt: '2026-04-01T00:00:00Z',
        narratives: { showHours: '', trialInformation: '' },
        supplemental: {
          vetClinic: null,
          accommodations: [],
          coverImageUrl: null,
          hospitalityNotes: null,
          awardsDescription: null,
          additionalNotes: null,
          pullQuote: 'The point of a trial is the dog.',
          pullQuoteAttribution: 'Constitution, Article I',
        },
        outputs: { premiumUrl: null },
      },
    } as unknown as Show;

    const { result } = renderHook(() => useMagazineLandingData(show, null, []));
    expect(result.current.pullQuote).toBe('The point of a trial is the dog.');
    expect(result.current.pullQuoteAttribution).toBe('Constitution, Article I');
  });
});
