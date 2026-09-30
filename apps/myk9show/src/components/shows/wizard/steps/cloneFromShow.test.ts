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

describe('buildCloneSnapshot junior handler fee', () => {
  const clone = (overrides: Partial<Show>) =>
    buildCloneSnapshot({ show: show(overrides), sourceTrials: [], people: [], templates: [] });

  it('carries a positive source fee into the draft', () => {
    expect(clone({ juniorHandlerFee: '15' }).show.juniorHandlerFee).toBe(15);
  });

  it('adds no key when the source show has no fee or a zero fee', () => {
    expect('juniorHandlerFee' in clone({}).show).toBe(false);
    expect('juniorHandlerFee' in clone({ juniorHandlerFee: '0' }).show).toBe(false);
  });
});
