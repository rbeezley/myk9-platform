import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mocks must be declared before dynamic imports of the module under test.
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useTrialClassesWithQuery: vi.fn(),
}));
vi.mock('@tanstack/react-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return { ...actual, useQuery: vi.fn() };
});
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass: vi.fn().mockResolvedValue(undefined) },
  replicatedTrialsTable: {},
}));
vi.mock('@/services/database/queries/userQueries', () => ({
  getJudgesWithQualifications: vi.fn(),
}));
vi.mock('@/services/database/queries/judgeQueries', () => ({
  upsertClassJudgeAssignment: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn() },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/queryClient', () => ({
  queryKeys: {
    trial: (id: string) => ['trials', id] as const,
    judgesWithQualifications: ['judges', 'with-qualifications'] as const,
  },
}));
vi.mock('@/features/pipeline/utils/pipelineReorder', () => ({
  DISPLAY_ORDER_STEP: 10,
  sortByDisplayOrder: <T>(arr: T[]) => [...arr],
}));
// Must be a regular function (not arrow) so `new TimeCalculationEngine()` works.
vi.mock('@/lib/timeCalculation', () => ({
  TimeCalculationEngine: vi.fn().mockImplementation(function () {
    return {
      calculateSchedule: () => [],
      getScheduleStats: () => ({}),
      optimizeSchedule: (c: unknown[]) => c,
    };
  }),
}));
vi.mock('./mockPersonnel', () => ({ MOCK_PERSONNEL: [] }));
vi.mock('./mapClassToCreatedClass', () => ({
  mapClassesToCreatedClasses: vi.fn().mockReturnValue([]),
}));

import { useQuery } from '@tanstack/react-query';
import { useTrialClassesWithQuery } from '@/hooks/useClassStoreCompat';
import { replicatedClassesTable } from '@/services/replication';
import { upsertClassJudgeAssignment } from '@/services/database/queries/judgeQueries';
import { logger } from '@/services/LoggingService';
import { useRunOrderPageData } from './useRunOrderPageData';
import type { CreatedClass } from '@/types/template.types';

function makeClass(id: string, runOrder: number): CreatedClass {
  return {
    id,
    runOrder,
    className: `Class ${id}`,
    classNumber: id,
    templateId: '',
    templateVersion: '1.0.0',
    trialId: 'trial-1',
    organization: 'AKC' as never,
    trialType: 'Scent Work' as never,
    element: '',
    level: '',
    section: '',
    status: 'Scheduled',
    fieldValues: { estimatedJudgingTime: 30 },
    personnel: { judgeId: '', judgeName: '', stewards: {} },
    entries: { maxEntries: 0, currentEntries: 0, waitlistEntries: 0 },
    createdBy: 'system',
    createdAt: new Date(),
  };
}

/** Configure the useQuery mock: first call = trial query, second = judges query. */
function mockQueries(showId: string | undefined) {
  (useQuery as Mock).mockReset();
  (useQuery as Mock)
    .mockReturnValueOnce({
      data: showId !== undefined ? { showId } : undefined,
      isLoading: false,
    })
    .mockReturnValue({ data: { data: [] }, isLoading: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  (useTrialClassesWithQuery as Mock).mockReturnValue({ classes: [], isLoading: false });
});

describe('useRunOrderPageData — handleReorder', () => {
  it('skips DB writes when class order has not changed', () => {
    mockQueries('show-abc');
    const { result } = renderHook(() => useRunOrderPageData('trial-1'));

    const classes = [makeClass('a', 1), makeClass('b', 2)];

    // First call establishes state.
    act(() => {
      result.current.handleReorder(classes);
    });
    vi.clearAllMocks();
    mockQueries('show-abc');

    // Second call with same order — no writes.
    act(() => {
      result.current.handleReorder(classes);
    });

    expect(replicatedClassesTable.updateClass).not.toHaveBeenCalled();
  });

  it('writes display_order for every class when order changes', () => {
    mockQueries('show-abc');
    const { result } = renderHook(() => useRunOrderPageData('trial-1'));

    // Prime state with [a, b].
    act(() => {
      result.current.handleReorder([makeClass('a', 1), makeClass('b', 2)]);
    });
    vi.clearAllMocks();
    mockQueries('show-abc');

    // Reorder to [b, a].
    act(() => {
      result.current.handleReorder([makeClass('b', 1), makeClass('a', 2)]);
    });

    expect(replicatedClassesTable.updateClass).toHaveBeenCalledTimes(2);
    expect(replicatedClassesTable.updateClass).toHaveBeenCalledWith('b', { displayOrder: 10 });
    expect(replicatedClassesTable.updateClass).toHaveBeenCalledWith('a', { displayOrder: 20 });
  });
});

describe('useRunOrderPageData — handleJudgeAssign', () => {
  it('persists to judge_assignments when showId is available', () => {
    mockQueries('show-abc');
    const { result } = renderHook(() => useRunOrderPageData('trial-1'));

    act(() => {
      result.current.handleJudgeAssign('class-1', 'judge-x');
    });

    expect(upsertClassJudgeAssignment).toHaveBeenCalledWith('show-abc', 'class-1', 'judge-x');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs a warning and skips persist when showId is not yet loaded', () => {
    mockQueries(undefined);
    const { result } = renderHook(() => useRunOrderPageData('trial-1'));

    act(() => {
      result.current.handleJudgeAssign('class-1', 'judge-x');
    });

    expect(upsertClassJudgeAssignment).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('showId not yet loaded'),
      'run-order',
      expect.objectContaining({ classId: 'class-1', judgeId: 'judge-x' })
    );
  });
});
