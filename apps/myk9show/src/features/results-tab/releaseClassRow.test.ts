import { describe, expect, it, vi } from 'vitest';

import type { ResultsClassRow } from './buildResultsClassRows';
import {
  canReleaseRow,
  getReleaseTick,
  OFFLINE_RELEASE_REASON,
  releaseClassRow,
  type ReleaseClassRowDeps,
} from './releaseClassRow';

vi.mock('@/features/show-map/resultsVerifiedMutations', () => ({
  readServerResultsVerifiedAt: async () => '2026-10-10T15:45:00Z',
}));
vi.mock('./useClassUnsyncedScores', () => ({ classHasUnsyncedScores: async () => false }));

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
      'in-ring',
      'not-started',
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

const depsWith = (over: Partial<ReleaseClassRowDeps>): ReleaseClassRowDeps => ({
  showId: 's1',
  verification: { verifyAsync: vi.fn().mockResolvedValue(undefined), refreshClass: vi.fn() },
  release: { mutateAsync: vi.fn().mockResolvedValue({ released: ['c1'] }) },
  checkChanged: () => false,
  verifyBlockedReason: null,
  releaseBlockedReason: null,
  ...over,
});

describe('releaseClassRow outcomes', () => {
  it('a rejected release write is a failed outcome with the retry message', async () => {
    const outcome = await releaseClassRow(
      row({}),
      depsWith({ release: { mutateAsync: vi.fn().mockRejectedValue(new Error('boom')) } })
    );
    expect(outcome).toEqual({
      kind: 'failed',
      message: 'Could not release the results. Try Release again.',
    });
  });

  it('a quiet verify failure carries its reason in the outcome; not quiet leaves it to the toast', async () => {
    const verifyAsync = vi
      .fn()
      .mockRejectedValue(new Error('The scores changed. Check them again.'));
    const quiet = await releaseClassRow(
      row({ phase: 'needs-checking' }),
      depsWith({ verification: { verifyAsync, refreshClass: vi.fn() }, quietVerify: true })
    );
    expect(verifyAsync).toHaveBeenCalledWith(expect.objectContaining({ classId: 'c1' }), {
      quiet: true,
    });
    expect(quiet).toEqual({ kind: 'failed', message: 'The scores changed. Check them again.' });

    const loud = await releaseClassRow(
      row({ phase: 'needs-checking' }),
      depsWith({ verification: { verifyAsync, refreshClass: vi.fn() } })
    );
    expect(loud).toMatchObject({ kind: 'failed', toasted: true });
  });
});
