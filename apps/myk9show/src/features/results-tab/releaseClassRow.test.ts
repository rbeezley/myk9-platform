import { describe, expect, it } from 'vitest';

import type { ResultsClassRow } from './buildResultsClassRows';
import { canReleaseRow, getReleaseTick, OFFLINE_RELEASE_REASON } from './releaseClassRow';

const row = (over: Partial<ResultsClassRow>): ResultsClassRow =>
  ({
    id: 'c1',
    phase: 'ready-to-release',
    releasedAt: null,
    statusCompleted: true,
    resultsCanonical: 'abc',
    ...over,
  }) as unknown as ResultsClassRow;

describe('the tickable rule is the single-class Release rule', () => {
  it('lets a checked class release', () => {
    expect(canReleaseRow(row({ phase: 'ready-to-release' }))).toBe(true);
  });

  it('lets a completed class with results on this device be checked and released', () => {
    expect(canReleaseRow(row({ phase: 'needs-checking' }))).toBe(true);
  });

  it('holds a class that is not marked complete or has no results on this device', () => {
    expect(canReleaseRow(row({ phase: 'needs-checking', statusCompleted: false }))).toBe(false);
    expect(canReleaseRow(row({ phase: 'needs-checking', resultsCanonical: null }))).toBe(false);
  });

  it('has no Release for any other phase or an already released class', () => {
    for (const phase of [
      'scoring',
      'needs-coin-flip',
      'released',
      'needs-initials',
      'done',
      'release-unknown',
    ] as const) {
      expect(canReleaseRow(row({ phase }))).toBe(false);
    }
    expect(canReleaseRow(row({ releasedAt: '2026-10-10T15:00:00Z' }))).toBe(false);
  });

  it('gives a releasable class a live box online and a disabled one with the reason offline', () => {
    expect(getReleaseTick(row({}), true)).toEqual({ kind: 'tick' });
    expect(getReleaseTick(row({}), false)).toEqual({
      kind: 'disabled',
      reason: OFFLINE_RELEASE_REASON,
    });
    expect(getReleaseTick(row({ phase: 'done' }), true)).toEqual({ kind: 'none' });
  });
});
