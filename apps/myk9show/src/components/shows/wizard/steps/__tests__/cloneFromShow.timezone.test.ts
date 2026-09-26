import { describe, expect, it } from 'vitest';
import type { Show, ShowTrial } from '@/types/show-types';
import { buildCloneSnapshot } from '../cloneFromShow';

// MYK9-830/831 second review round: buildCloneSnapshot copied trials but not
// their timezone, so wizardStore's completeCloneHydration fell back to
// initialState.show.timezone (the SECRETARY'S browser zone at clone time)
// instead of the source show's real one.
describe('buildCloneSnapshot timezone', () => {
  const show = (): Show =>
    ({
      id: 'source-show',
      name: 'Source Show',
      organization: 'UKC',
      location: 'Venue',
      clubId: 'club-1',
      preEntryFee: '30',
      dayOfShowFee: '35',
    }) as unknown as Show;

  const trial = (timezone: string | undefined): ShowTrial =>
    ({
      id: 'source-trial-1',
      name: 'Trial 1',
      date: '2026-10-10',
      trialNumber: '1',
      status: 'Completed',
      timezone,
      classes: [],
    }) as unknown as ShowTrial;

  it("initializes the clone draft from the source show's first trial timezone", () => {
    const snapshot = buildCloneSnapshot({
      show: show(),
      sourceTrials: [trial('America/Chicago')],
      people: [],
      templates: [],
    });
    expect(snapshot.show.timezone).toBe('America/Chicago');
  });

  it('falls back to America/New_York when the source trial predates the timezone column', () => {
    const snapshot = buildCloneSnapshot({
      show: show(),
      sourceTrials: [trial(undefined)],
      people: [],
      templates: [],
    });
    expect(snapshot.show.timezone).toBe('America/New_York');
  });
});
