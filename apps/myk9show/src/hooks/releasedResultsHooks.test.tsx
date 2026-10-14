import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import type { ExhibitorResult } from '@/hooks/queries/useExhibitorResults';
import type { SportTemplateRow, SportTitleRow } from '@/types/sport-template-types';
import { usePerformanceStatistics } from './usePerformanceStatistics';
import { useTitleProgress } from './useTitleProgress';

// MYK9-1178: only useExhibitorResults and the unrelated data sources are
// mocked, so the real hooks run their own release gate and count.
const mocks = vi.hoisted(() => ({ results: [] as unknown[] }));
vi.mock('@/hooks/queries/useExhibitorResults', () => ({
  useExhibitorResults: () => ({
    data: mocks.results,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/useManualResultsDatabase', () => ({
  useManualResultsQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useQualifyingManualResultsQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const TEMPLATE: SportTemplateRow = {
  id: 'tmpl-akc',
  organization: 'AKC',
  sport_name: 'Scent Work',
  sport_code: 'akc-scent-work',
  elements: ['Container'],
  levels: ['Novice'],
  section_mode: 'none',
  divisions: [],
  operational_config: {},
  export_config: {},
  is_active: true,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
};
const SCN: SportTitleRow = {
  id: 'title-SCN',
  sport_template_id: 'tmpl-akc',
  abbreviation: 'SCN',
  full_name: 'Scent Work Container Novice',
  title_type: 'element',
  required_legs: 3,
  required_elements: ['Container'],
  prerequisite_title_id: null,
  supersedes_title_ids: [],
  sort_order: 100,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
};
vi.mock('@/hooks/queries/useSportTemplates', () => ({
  useSportTemplatesQuery: () => ({
    data: [TEMPLATE],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAllSportTitlesQuery: () => ({
    data: [SCN],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

function row(id: string, dogId: string, resultsReleasedAt: string | null): ExhibitorResult {
  return {
    id,
    dogId,
    dogName: dogId,
    dogCallName: dogId,
    showId: 's',
    classId: 'c',
    trialId: 't',
    className: 'Container Novice',
    classLevel: 'Novice',
    classElement: 'Container',
    resultText: 'Q',
    resultStatus: 'qualified',
    searchTimeSeconds: 30,
    totalFaults: 0,
    finalPlacement: 1,
    scoringCompletedAt: '2026-10-01T00:00:00Z',
    showName: 'Show',
    showDate: '2026-10-01',
    resultsReleasedAt,
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
);

mocks.results = [
  row('released', 'dog-a', '2026-10-02T00:00:00Z'),
  row('prelim-1', 'dog-a', null),
  row('prelim-2', 'dog-a', null),
  row('other-dog', 'dog-b', '2026-10-02T00:00:00Z'),
];

describe('release gate in the derived hooks (MYK9-1178)', () => {
  it('statistics count only this dog released rows and report the unreleased ones', () => {
    const { result } = renderHook(() => usePerformanceStatistics('dog-a'), { wrapper });
    expect(result.current.stats?.overall.total).toBe(1);
    expect(result.current.stats?.overall.qualified).toBe(1);
    expect(result.current.unreleasedCount).toBe(2);
  });

  it('title progress counts one platform leg and reports the unreleased rows', () => {
    const { result } = renderHook(() => useTitleProgress('dog-a'), { wrapper });
    const scn = result.current.progressBySport['tmpl-akc']?.find(t => t.abbreviation === 'SCN');
    expect(scn?.earnedLegs).toBe(1);
    expect(scn?.legs.filter(l => l.source === 'platform')).toHaveLength(1);
    expect(result.current.unreleasedCount).toBe(2);
  });
});
