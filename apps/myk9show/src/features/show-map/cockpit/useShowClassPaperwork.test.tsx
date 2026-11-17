import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';
import { useShowClassPaperwork } from './useShowClassPaperwork';

// MYK9-2116: with no show details (a cold offline open) a class that depends on the show's
// assignedJudges hashes the unresolved judge, and once they load it matches the printed fingerprint.
const mocks = vi.hoisted(() => ({ show: null as unknown }));

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({ show: mocks.show }),
}));

const ownJudge = {
  id: 'class-own',
  trial_id: 'trial-1',
  element: 'Container',
  level: 'Novice',
  judge_assignments: [
    { person_id: 'p1', status: 'confirmed', people: { first_name: 'Pat', last_name: 'Donovan' } },
  ],
};
const viaAssigned = {
  id: 'class-assigned',
  trial_id: 'trial-1',
  element: 'Interior',
  level: 'Novice',
};
const classes = [ownJudge, viaAssigned] as unknown as DbClass[];
const entries = ['class-own', 'class-assigned'].map((classId, index) => ({
  id: `e${index}`,
  class_id: classId,
  dog_id: `d${index}`,
  armband: `10${index}`,
  run_order: 1,
  check_in_status: 'no-status',
  entry_status: 'confirmed',
})) as unknown as DbEntry[];
const assignedJudges = [
  { judgeId: 'j1', judgeName: 'Ada Assigned', assignedClasses: ['class-assigned'] },
];

const records = classes.map(classItem => {
  const descriptor = buildReportPaperworkDescriptor({
    reportId: 'check-in-sheet',
    scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: classItem.id },
    classes,
    entries,
    assignedJudges: assignedJudges as never,
  })!;
  return {
    id: `r-${classItem.id}`,
    showId: 'show-1',
    trialId: 'trial-1',
    classId: classItem.id,
    scopeKind: 'class',
    reportId: 'check-in-sheet',
    coverage: descriptor.coverage,
    fingerprint: descriptor.fingerprint,
    printedBy: 'u1',
    printedByName: 'Jannie',
    printedAt: '2026-12-07T08:00:00Z',
  } as unknown as ReplicatedPaperworkPrint;
});

vi.mock('@/hooks/queries/useShowClassRows', () => ({
  useShowClassRows: () => ({
    data: classes,
    isLoading: false,
    isError: false,
    isFetching: false,
    isSuccess: true,
    isRefetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/usePrintedSheetEntries', () => ({
  usePrintedSheetEntries: () => ({ data: undefined }),
}));
vi.mock('./useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({
    data: records,
    isLoading: false,
    isError: false,
    syncFailed: false,
    refetch: vi.fn(),
    resync: vi.fn(),
  }),
}));

function checkInStates() {
  const { result } = renderHook(() =>
    useShowClassPaperwork({
      showId: 'show-1',
      trials: [{ id: 'trial-1', trialDate: '2026-12-07' }],
      entries,
      returnTo: '/x',
    })
  );
  const stateOf = (classId: string) =>
    result.current.byClassId.get(classId)?.find(item => item.reportId === 'check-in-sheet')?.state;
  return { own: stateOf('class-own'), assigned: stateOf('class-assigned') };
}

describe('useShowClassPaperwork judge loading (MYK9-2116)', () => {
  beforeEach(() => {
    mocks.show = null;
  });

  it('hashes the unresolved judge with none loaded, and matches the printed fingerprint once it loads', () => {
    expect(checkInStates()).toEqual({ own: 'current', assigned: 'stale' });
    mocks.show = { id: 'show-1', assignedJudges };
    expect(checkInStates()).toEqual({ own: 'current', assigned: 'current' });
  });
});
