import { describe, expect, it } from 'vitest';
import type { Show, ShowTrial } from '@/types/show-types';
import { buildCloneSnapshot } from './cloneFromShow';

const show = (overrides: Partial<Show> = {}) =>
  ({
    id: 'show-1',
    name: 'Heartland',
    organization: 'AKC',
    location: 'Venue',
    clubId: 'club-1',
    preEntryFee: '30',
    dayOfShowFee: '35',
    assignedJudges: [],
    ...overrides,
  }) as unknown as Show;

const trial = (overrides: Partial<ShowTrial> = {}) =>
  ({
    id: 'trial-1',
    name: 'Saturday Trial',
    ...overrides,
  }) as unknown as ShowTrial;

/**
 * MYK9-831 (Codex review, PR #2543): `completeCloneHydration` merges this
 * snapshot's `show` over `initialState.show`, so an omitted timezone field
 * fell back to the CLONING secretary's current browser zone rather than the
 * source show's own — wrong for a club planning next year's show from a
 * different city than the venue.
 */
describe('buildCloneSnapshot timezone', () => {
  it('carries the source show timezone into the clone snapshot', () => {
    const snapshot = buildCloneSnapshot({
      show: show(),
      sourceTrials: [trial({ timezone: 'America/Chicago' })],
      people: [],
      templates: [],
    });
    expect(snapshot.show.timezone).toBe('America/Chicago');
  });

  it('falls back to America/New_York when the source show has no trials', () => {
    const snapshot = buildCloneSnapshot({
      show: show(),
      sourceTrials: [],
      people: [],
      templates: [],
    });
    expect(snapshot.show.timezone).toBe('America/New_York');
  });
});
