import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import { useGazetteLandingData, buildJourneySteps } from '../useGazetteLandingData';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [] }),
}));

const baseShow = (overrides: Partial<Show> = {}): Show =>
  ({
    id: 'show-1',
    name: 'Spring Scent Work Trial',
    organization: 'Bexar County Kennel Club',
    startDate: '2026-06-12',
    endDate: '2026-06-14',
    entryOpenDate: '2026-04-15',
    entryCloseDate: '2026-06-03',
    preEntryFee: '25',
    ...overrides,
  }) as Show;

describe('useGazetteLandingData', () => {
  it('maps show / club / dates onto the data shape', () => {
    const { result } = renderHook(() => useGazetteLandingData(baseShow(), null, []));
    expect(result.current.clubName).toBe('Bexar County Kennel Club');
    expect(result.current.showName).toBe('Spring Scent Work Trial');
    expect(result.current.trialStartDate).toBe('2026-06-12');
    expect(result.current.trialEndDate).toBe('2026-06-14');
    expect(result.current.entryWizardUrl).toBe('/shows/show-1/register');
  });

  it('falls back to /shows when show id is missing', () => {
    const show = baseShow();
    delete (show as { id?: string }).id;
    const { result } = renderHook(() => useGazetteLandingData(show, null, []));
    expect(result.current.entryWizardUrl).toBe('/shows');
  });

  it('exposes the default fixed visual metadata', () => {
    const { result } = renderHook(() => useGazetteLandingData(baseShow(), null, []));
    expect(result.current.volumeRoman).toBe('LXXIX');
    expect(result.current.edition).toBe(47);
    expect(result.current.motto).toMatch(/news fit to point/);
  });

  it('emits a fee row for preEntryFee', () => {
    const { result } = renderHook(() => useGazetteLandingData(baseShow(), null, []));
    expect(result.current.fees.length).toBeGreaterThan(0);
    expect(result.current.fees[0].label).toBe('First entry');
  });

  it('dedups judges across trials and lowercase-romans their trial labels', () => {
    const trials = [
      { id: 't1', trialNumber: 1, trialDate: '2026-06-12', judge: 'Mrs. Beagles' },
      { id: 't2', trialNumber: 3, trialDate: '2026-06-13', judge: 'Mrs. Beagles' },
      { id: 't3', trialNumber: 5, trialDate: '2026-06-14', judge: 'Mr. Whitfield' },
    ] as never[];
    const { result } = renderHook(() => useGazetteLandingData(baseShow(), null, trials));
    expect(result.current.judges).toHaveLength(2);
    const beagles = result.current.judges.find(j => j.name === 'Mrs. Beagles');
    expect(beagles?.trials).toEqual(['i', 'iii']);
  });

  it('derives entryLimit as the max of trial maxTotalEntries', () => {
    const trials = [
      { id: 't1', trialNumber: 1, trialDate: '2026-06-12', maxTotalEntries: 60 },
      { id: 't2', trialNumber: 2, trialDate: '2026-06-12', maxTotalEntries: 90 },
    ] as never[];
    const { result } = renderHook(() => useGazetteLandingData(baseShow(), null, trials));
    expect(result.current.entryLimit).toBe(90);
  });

  it('lifts hospitality / accommodations from published experience supplemental', () => {
    const show = baseShow({
      experienceIsPublished: true,
      experiencePublishedContent: {
        style: 'gazette',
        generatedAt: '2026-05-09T14:00:00.000Z',
        narratives: { showHours: 'Hours', trialInformation: 'Info' },
        supplemental: {
          vetClinic: { name: 'Alamo Vet', address: '8420 Pat Booker Rd', phone: '(210) 555-2840' },
          accommodations: [{ name: 'Hampton Inn', address: '100 Live Oak', phone: '555-0100' }],
          hospitalityNotes: 'Tacos at check-in.',
          awardsDescription: 'Rosettes presented daily.',
          additionalNotes: null,
        },
        outputs: { premiumUrl: null },
      },
    } as never);
    const { result } = renderHook(() => useGazetteLandingData(show, null, []));
    expect(result.current.hospitalityNotes).toBe('Tacos at check-in.');
    expect(result.current.awardsDescription).toBe('Rosettes presented daily.');
    expect(result.current.accommodations).toHaveLength(2); // 1 hotel + 1 vet
    expect(result.current.accommodations[0].type).toBe('Lodging');
    expect(result.current.accommodations[1].type).toBe('Emergency Vet');
  });

  it('schedule and officers default to empty arrays in MVP', () => {
    const { result } = renderHook(() => useGazetteLandingData(baseShow(), null, []));
    expect(result.current.schedule).toEqual([]);
    expect(result.current.officers).toEqual([]);
  });
});

describe('buildJourneySteps', () => {
  it('filters out steps without a date', () => {
    const steps = buildJourneySteps('2026-04-15', null, null, '2026-06-12', '2026-06-14');
    expect(steps.every(s => s.date !== null)).toBe(true);
    expect(steps).toHaveLength(3);
  });

  it('marks past dates as done', () => {
    const past = '2020-01-01';
    const steps = buildJourneySteps(past, null, null, null, null);
    expect(steps[0].status).toBe('done');
  });

  it('marks far-future dates as future', () => {
    const future = '2099-01-01';
    const steps = buildJourneySteps(future, null, null, null, null);
    expect(steps[0].status).toBe('future');
  });
});
