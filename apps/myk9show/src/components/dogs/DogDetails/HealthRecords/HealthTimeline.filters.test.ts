import { describe, it, expect } from 'vitest';
import {
  filterHealthEvents,
  hasActiveHealthTimelineFilters,
  defaultHealthTimelineFilters,
  type HealthTimelineFilters,
} from './HealthTimeline.filters';
import type { HealthEvent } from './HealthTimeline';

function makeEvent(overrides: Partial<HealthEvent> & Pick<HealthEvent, 'id'>): HealthEvent {
  return {
    type: 'vaccination',
    title: 'Rabies Vaccination',
    description: 'Three-year rabies vaccine',
    date: new Date(2026, 1, 14),
    vetName: 'Miller',
    clinic: 'Oak Street Vet',
    status: 'completed',
    ...overrides,
  };
}

const events: HealthEvent[] = [
  makeEvent({
    id: 'vacc-1',
    type: 'vaccination',
    title: 'Rabies Vaccination',
    vetName: 'Dr. Miller',
    clinic: 'Oak Street Vet',
    date: new Date(2026, 1, 14),
  }),
  makeEvent({
    id: 'visit-1',
    type: 'vet_visit',
    title: 'Annual Checkup',
    description: 'Routine wellness exam',
    vetName: 'Dr. Chen',
    clinic: 'Riverside Animal Hospital',
    date: new Date(2025, 5, 1),
  }),
  makeEvent({
    id: 'med-1',
    type: 'medication',
    title: 'Heartworm Preventative',
    description: 'Monthly chewable',
    vetName: 'Dr. Chen',
    clinic: 'Riverside Animal Hospital',
    date: new Date(2024, 11, 31),
  }),
];

describe('filterHealthEvents', () => {
  it('returns all events when no filters are active', () => {
    expect(filterHealthEvents(events, defaultHealthTimelineFilters)).toHaveLength(3);
  });

  it('filters by search term matching the title', () => {
    const result = filterHealthEvents(events, {
      ...defaultHealthTimelineFilters,
      searchTerm: 'rabies',
    });
    expect(result.map(e => e.id)).toEqual(['vacc-1']);
  });

  it('filters by search term matching the provider (vetName)', () => {
    const result = filterHealthEvents(events, {
      ...defaultHealthTimelineFilters,
      searchTerm: 'chen',
    });
    expect(result.map(e => e.id).sort()).toEqual(['med-1', 'visit-1']);
  });

  it('filters by search term matching the clinic', () => {
    const result = filterHealthEvents(events, {
      ...defaultHealthTimelineFilters,
      searchTerm: 'riverside',
    });
    expect(result.map(e => e.id).sort()).toEqual(['med-1', 'visit-1']);
  });

  it('filters by type', () => {
    const result = filterHealthEvents(events, {
      ...defaultHealthTimelineFilters,
      filterType: 'vet_visit',
    });
    expect(result.map(e => e.id)).toEqual(['visit-1']);
  });

  it('filters by year', () => {
    const result = filterHealthEvents(events, {
      ...defaultHealthTimelineFilters,
      selectedYear: 2025,
    });
    expect(result.map(e => e.id)).toEqual(['visit-1']);
  });

  it('filters by a year-boundary date (Dec 31)', () => {
    const result = filterHealthEvents(events, {
      ...defaultHealthTimelineFilters,
      selectedYear: 2024,
    });
    expect(result.map(e => e.id)).toEqual(['med-1']);
  });

  it('ANDs search, type, and year filters together', () => {
    const filters: HealthTimelineFilters = {
      searchTerm: 'chen',
      filterType: 'vet_visit',
      selectedYear: 2025,
    };
    expect(filterHealthEvents(events, filters).map(e => e.id)).toEqual(['visit-1']);
  });

  it('returns no results when combined filters exclude everything', () => {
    const filters: HealthTimelineFilters = {
      searchTerm: 'chen',
      filterType: 'vaccination',
      selectedYear: 2025,
    };
    expect(filterHealthEvents(events, filters)).toEqual([]);
  });
});

describe('hasActiveHealthTimelineFilters', () => {
  it('is false for the default filters', () => {
    expect(hasActiveHealthTimelineFilters(defaultHealthTimelineFilters)).toBe(false);
  });

  it('is true when a search term is present', () => {
    expect(
      hasActiveHealthTimelineFilters({ ...defaultHealthTimelineFilters, searchTerm: 'rabies' })
    ).toBe(true);
  });

  it('is true when a type filter is active', () => {
    expect(
      hasActiveHealthTimelineFilters({ ...defaultHealthTimelineFilters, filterType: 'allergy' })
    ).toBe(true);
  });

  it('is true when a year filter is active', () => {
    expect(
      hasActiveHealthTimelineFilters({ ...defaultHealthTimelineFilters, selectedYear: 2025 })
    ).toBe(true);
  });

  it('ignores whitespace-only search terms', () => {
    expect(
      hasActiveHealthTimelineFilters({ ...defaultHealthTimelineFilters, searchTerm: '   ' })
    ).toBe(false);
  });

  it('is false for the vaccinationsOnly baseline (filterType locked to "vaccination")', () => {
    expect(
      hasActiveHealthTimelineFilters(
        { ...defaultHealthTimelineFilters, filterType: 'vaccination' },
        'vaccination'
      )
    ).toBe(false);
  });

  it('is true when a search term is added on top of the vaccinationsOnly baseline', () => {
    expect(
      hasActiveHealthTimelineFilters(
        { searchTerm: 'rabies', filterType: 'vaccination', selectedYear: null },
        'vaccination'
      )
    ).toBe(true);
  });

  it('is true when filterType is "vaccination" against the default ("all") baseline', () => {
    expect(
      hasActiveHealthTimelineFilters({ ...defaultHealthTimelineFilters, filterType: 'vaccination' })
    ).toBe(true);
  });
});
