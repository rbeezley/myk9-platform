/**
 * MYK9-642 round 1, finding J-F1.
 *
 * The show store's replication mapper hardcodes `trials: []`, so the zone the
 * day-of-show rule was fed was always the `America/New_York` fallback. These
 * tests pin the source of truth: the trial store, filtered to this show.
 *
 * Mutation check for this file: make the hook read an empty array instead of
 * the store (i.e. restore the old source) and both "reads the show's real trial
 * timezone" and "uses the FIRST trial by date" go red with
 * `expected 'America/New_York' to be 'America/Chicago'`.
 *
 * The trial-store stub is built per test and the module re-imported each time,
 * deliberately: a module-scope mutable fixture would be shared state that the
 * shuffled CI run has to be re-proved against.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

interface StubTrial {
  id: string;
  showId: string;
  trialDate: string;
  timezone: string;
}

async function resolveZone(trials: StubTrial[], showId: string | undefined): Promise<string> {
  vi.resetModules();
  vi.doMock('@/store/trialStore', () => ({
    useTrialStore: (selector: (state: { trials: StubTrial[] }) => unknown) => selector({ trials }),
  }));
  const { useEntryWindowTimezone } = await import('./useEntryWindowTimezone');
  return renderHook(() => useEntryWindowTimezone(showId)).result.current;
}

afterEach(() => {
  vi.doUnmock('@/store/trialStore');
  vi.resetModules();
});

describe('useEntryWindowTimezone', () => {
  it("reads the show's real trial timezone, not the America/New_York fallback", async () => {
    await expect(
      resolveZone(
        [{ id: 'trial-1', showId: 'show-1', trialDate: '2026-11-08', timezone: 'America/Chicago' }],
        'show-1'
      )
    ).resolves.toBe('America/Chicago');
  });

  it('ignores trials belonging to another show', async () => {
    await expect(
      resolveZone(
        [{ id: 'other', showId: 'show-2', trialDate: '2026-11-08', timezone: 'America/Chicago' }],
        'show-1'
      )
    ).resolves.toBe('America/New_York');
  });

  it('uses the FIRST trial by date when a show spans zones', async () => {
    // Same ordering as `submit_show_entries` (`ORDER BY t.date NULLS LAST, t.id`).
    await expect(
      resolveZone(
        [
          { id: 'sun', showId: 'show-1', trialDate: '2026-11-09', timezone: 'America/Denver' },
          { id: 'sat', showId: 'show-1', trialDate: '2026-11-08', timezone: 'America/Chicago' },
        ],
        'show-1'
      )
    ).resolves.toBe('America/Chicago');
  });

  it('falls back when no trials are loaded yet', async () => {
    await expect(resolveZone([], 'show-1')).resolves.toBe('America/New_York');
  });

  it('falls back when the show id is absent', async () => {
    await expect(
      resolveZone(
        [{ id: 'trial-1', showId: 'show-1', trialDate: '2026-11-08', timezone: 'America/Chicago' }],
        undefined
      )
    ).resolves.toBe('America/New_York');
  });
});
