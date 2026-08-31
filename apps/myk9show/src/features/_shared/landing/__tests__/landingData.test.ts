import { describe, expect, it } from 'vitest';
import type { Trial } from '@/components/trials/types/trial.types';
import type { Show } from '@/types/show-types';
import { buildLandingData } from '../landingData';

const show = {
  id: 'show-259',
  name: 'Autumn Nosework Classic',
  organization: 'Prairie Dog Club',
  location: '100 Trial Way',
  startDate: '2026-10-10',
  endDate: '2026-10-11',
  entryOpenDate: '2026-08-01',
  entryCloseDate: '2026-09-20',
  preEntryFee: '25',
  dayOfShowFee: '35',
  experienceIsPublished: true,
  experiencePublishedContent: {
    style: 'heritage',
    generatedAt: '2026-08-29T12:00:00.000Z',
    narratives: { showHours: '7–5', trialInformation: 'Two days of scent work.' },
    supplemental: {
      vetClinic: null,
      accommodations: [{ name: 'Trial Inn', address: '1 Main St', phone: '555-0100' }],
      coverImageUrl: null,
      hospitalityNotes: 'Coffee opens at seven.',
      awardsDescription: 'Rosettes are presented after each trial.',
      additionalNotes: 'Dogs must remain leashed outside the search area.',
    },
    outputs: { premiumUrl: null },
  },
} as Show;

const trials = [
  {
    id: 'trial-2',
    showId: show.id,
    trialNumber: 2,
    trialDate: '2026-10-11',
    judge: 'Alex Judge',
    maxTotalEntries: 75,
    registryId: 'AKC',
  },
  {
    id: 'trial-1',
    showId: show.id,
    trialNumber: 1,
    trialDate: '2026-10-10',
    judge: 'Alex Judge',
    maxTotalEntries: 50,
    registryId: 'AKC',
    confirmationDate: '2026-09-25',
  },
] as unknown as Trial[];

describe('buildLandingData', () => {
  it('derives the shared factual contract once for every landing style', () => {
    const data = buildLandingData(show, trials[1], trials, 12);

    expect(data).toMatchObject({
      clubName: 'Prairie Dog Club',
      showName: 'Autumn Nosework Classic',
      venueAddress: '100 Trial Way',
      entryCount: 12,
      entryLimit: 75,
      awardsDescription: 'Rosettes are presented after each trial.',
      houseRulesNotes: 'Dogs must remain leashed outside the search area.',
      hospitalityNotes: 'Coffee opens at seven.',
      entryWizardUrl: '/shows/show-259/register',
    });
    expect(data.trials.map(trial => trial.id)).toEqual(['trial-1', 'trial-2']);
    expect(data.judges).toEqual([
      expect.objectContaining({ name: 'Alex Judge', trials: ['I', 'II'] }),
    ]);
    expect(data.journeySteps.map(step => step.label)).toEqual([
      'Entries open',
      'Entries close',
      'Confirmations sent',
      'Trial begins',
      'Trial concludes',
    ]);
  });

  it('distinguishes a successful empty count from an unavailable count', () => {
    expect(buildLandingData(show, trials[1], trials, 0).entryCount).toBe(0);
    expect(buildLandingData(show, trials[1], trials, null).entryCount).toBeNull();
  });

  // MYK9-282: the previous comparator was parseInt(trialNumber) - parseInt(...).
  // trials.trial_number is TEXT and every real row is non-numeric ("Friday Trial 1"),
  // so both sides were NaN, the comparator returned NaN for every pair, and the sort
  // silently did nothing — trials rendered in fetch order. Nothing asserted order, so
  // nothing failed.
  it('orders trials by label, numerically, even when the label is not a number', () => {
    const textTrials = [
      { ...trials[0], id: 't-10', trialNumber: 'Friday Trial 10' },
      { ...trials[1], id: 't-2', trialNumber: 'Friday Trial 2' },
    ] as unknown as typeof trials;

    const data = buildLandingData(show, textTrials[0], textTrials, 12);

    // "Trial 2" before "Trial 10" — lexicographic ordering would invert these.
    expect(data.trials.map(t => t.trialNumber)).toEqual([
      'Friday Trial 2',
      'Friday Trial 10',
    ]);
  });

  it('still orders a purely numeric fixture, proving the sort runs at all', () => {
    // The fixture is deliberately supplied out of order (trial-2 first).
    const data = buildLandingData(show, trials[1], trials, 12);
    expect(data.trials.map(t => t.id)).toEqual(['trial-1', 'trial-2']);
  });
});
