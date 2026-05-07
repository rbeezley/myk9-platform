import { describe, it, expect } from 'vitest';
import {
  buildJudgeStrip,
  composeFallbackArticle,
  extractCityState,
  JUDGES_STRIP_MAX,
} from '../gazetteHelpers';
import type { CoverContext } from '../coverContext';

type Trial = CoverContext['data']['trials'][number];

function trialWithJudges(judges: Array<{ name: string; element?: string }>): Trial {
  // Cast through unknown — we only exercise the fields buildJudgeStrip reads.
  return {
    judges: judges.map(j => ({
      name: j.name,
      elements: j.element ? [j.element] : [],
    })),
  } as unknown as Trial;
}

describe('buildJudgeStrip', () => {
  it('returns an empty array when no trials', () => {
    expect(buildJudgeStrip([])).toEqual([]);
  });

  it('returns one entry for a single judge with an element', () => {
    const trials = [trialWithJudges([{ name: 'Alice', element: 'Container' }])];
    expect(buildJudgeStrip(trials)).toEqual(['Alice · Container']);
  });

  it('returns 4 entries with no overflow marker when exactly at the cap', () => {
    const trials = [
      trialWithJudges([
        { name: 'A', element: 'X' },
        { name: 'B', element: 'X' },
        { name: 'C', element: 'X' },
        { name: 'D', element: 'X' },
      ]),
    ];
    const result = buildJudgeStrip(trials);
    expect(result).toHaveLength(JUDGES_STRIP_MAX);
    expect(result.some(e => e.includes('and others'))).toBe(false);
  });

  it('returns 4 entries with overflow marker for 5 judges (no leading middot)', () => {
    const trials = [
      trialWithJudges([
        { name: 'A', element: 'X' },
        { name: 'B', element: 'X' },
        { name: 'C', element: 'X' },
        { name: 'D', element: 'X' },
        { name: 'E', element: 'X' },
      ]),
    ];
    const result = buildJudgeStrip(trials);
    expect(result).toHaveLength(JUDGES_STRIP_MAX);
    expect(result[result.length - 1]).toBe('…and others');
    expect(result[result.length - 1]?.startsWith('·')).toBe(false);
  });

  it('caps at 4 entries with overflow marker for 10 judges', () => {
    const trials = [
      trialWithJudges(
        Array.from({ length: 10 }, (_, i) => ({
          name: `J${i}`,
          element: 'X',
        }))
      ),
    ];
    const result = buildJudgeStrip(trials);
    expect(result).toHaveLength(JUDGES_STRIP_MAX);
    expect(result[result.length - 1]).toBe('…and others');
  });
});

describe('extractCityState', () => {
  it('returns empty string for empty input', () => {
    expect(extractCityState('')).toBe('');
  });

  it('strips ZIP from "<street>, <city>, <state> <zip>" addresses', () => {
    expect(extractCityState('123 Main St, Springfield, IL 62701')).toBe('Springfield, IL');
  });
});

describe('composeFallbackArticle', () => {
  it('uses provided club + show name when present', () => {
    const out = composeFallbackArticle('Club X', 'Spring Trial', 'Park Hall', 'Mar 1–2');
    expect(out).toContain('Club X');
    expect(out).toContain('the Spring Trial');
    expect(out).toContain('at Park Hall');
    expect(out).toContain('Mar 1–2');
  });

  it('falls back to generic phrasing when club/show missing', () => {
    const out = composeFallbackArticle('', '', '', 'Mar 1–2');
    expect(out).toContain('The host club');
    expect(out).toContain('an upcoming scent work trial');
  });
});
