import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';
import { useShowClassPaperwork } from './useShowClassPaperwork';

// MYK9-2116: a judge known only through the show's assignedJudges is part of the fingerprint, so
// until the show details load no card may say "changed".
const mocks = vi.hoisted(() => ({ show: null as unknown }));

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({ show: mocks.show }),
}));

const klass = { id: 'class-1', trial_id: 'trial-1', element: 'Container', level: 'Novice' };
const entries = [
  {
    id: 'e1',
    class_id: 'class-1',
    dog_id: 'd1',
    armband: '101',
    run_order: 1,
    check_in_status: 'no-status',
    entry_status: 'confirmed',
  },
] as unknown as DbEntry[];
const assignedJudges = [{ judgeId: 'j1', judgeName: 'Ada Assigned', assignedClasses: ['class-1'] }];

const scope = { kind: 'class' as const, showId: 'show-1', trialId: 'trial-1', classId: 'class-1' };
const printedDescriptor = buildReportPaperworkDescriptor({
  reportId: 'check-in-sheet',
  scope,
  classes: [klass as unknown as DbClass],
  entries,
  assignedJudges: assignedJudges as never,
})!;
const record = {
  id: 'r1',
  showId: 'show-1',
  trialId: 'trial-1',
  classId: 'class-1',
  scopeKind: 'class',
  reportId: 'check-in-sheet',
  coverage: printedDescriptor.coverage,
  fingerprint: printedDescriptor.fingerprint,
  printedBy: 'u1',
  printedByName: 'Jannie',
  printedAt: '2026-12-07T08:00:00Z',
} as unknown as ReplicatedPaperworkPrint;

vi.mock('@/hooks/queries/useShowClassRows', () => ({
  useShowClassRows: () => ({
    data: [klass],
    isLoading: false,
    isError: false,
    isFetching: false,
    isSuccess: true,
    isRefetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('./useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({
    data: [record],
    isLoading: false,
    isError: false,
    syncFailed: false,
    refetch: vi.fn(),
    resync: vi.fn(),
  }),
}));

function checkInState() {
  const { result } = renderHook(() =>
    useShowClassPaperwork({
      showId: 'show-1',
      trials: [{ id: 'trial-1', trialDate: '2026-12-07' }],
      entries,
      returnTo: '/x',
    })
  );
  return result.current.byClassId.get('class-1')?.find(item => item.reportId === 'check-in-sheet')
    ?.state;
}

describe('useShowClassPaperwork waits for the show details (MYK9-2116)', () => {
  beforeEach(() => {
    mocks.show = null;
  });

  it('reads unknown while the show details are still loading', () => {
    expect(checkInState()).toBe('unknown');
  });

  it('reads current once the show loads with the matching judge', () => {
    mocks.show = { id: 'show-1', assignedJudges };
    expect(checkInState()).toBe('current');
  });
});
