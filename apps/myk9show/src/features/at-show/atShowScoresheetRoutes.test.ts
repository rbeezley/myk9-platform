import { describe, it, expect } from 'vitest';
import {
  buildAtShowScoreSheetRoute,
  resolveScoreSheetEntryListRoute,
} from './atShowScoresheetRoutes';

describe('atShowScoresheetRoutes', () => {
  it('builds a single-class scoresheet route with no query', () => {
    expect(buildAtShowScoreSheetRoute('show-1', 'class-a', 'entry-1')).toBe(
      '/at-show/show-1/class/class-a/score/entry-1'
    );
  });

  it('carries the combined pair on the scoresheet route', () => {
    expect(
      buildAtShowScoreSheetRoute('show-1', 'class-a', 'entry-1', 'class-a,class-b')
    ).toBe('/at-show/show-1/class/class-a/score/entry-1?combined=class-a%2Cclass-b');
  });

  it('returns to the combined A/B list when the scoresheet came from it', () => {
    expect(resolveScoreSheetEntryListRoute('show-1', 'class-a', 'class-a,class-b')).toBe(
      '/at-show/show-1/class/class-a/class-b'
    );
    // A Section B dog keeps the A/B order of the combined URL.
    expect(resolveScoreSheetEntryListRoute('show-1', 'class-b', 'class-a,class-b')).toBe(
      '/at-show/show-1/class/class-a/class-b'
    );
  });

  it('falls back to the single-class list without a usable pair', () => {
    const single = '/at-show/show-1/class/class-a';
    expect(resolveScoreSheetEntryListRoute('show-1', 'class-a', null)).toBe(single);
    expect(resolveScoreSheetEntryListRoute('show-1', 'class-a', '')).toBe(single);
    expect(resolveScoreSheetEntryListRoute('show-1', 'class-a', 'class-a')).toBe(single);
    expect(resolveScoreSheetEntryListRoute('show-1', 'class-a', 'class-a,class-a')).toBe(single);
    expect(resolveScoreSheetEntryListRoute('show-1', 'class-a', 'a,b,c')).toBe(single);
    // A pair that does not include this scoresheet's class is not its list.
    expect(resolveScoreSheetEntryListRoute('show-1', 'class-a', 'class-x,class-y')).toBe(single);
  });
});
