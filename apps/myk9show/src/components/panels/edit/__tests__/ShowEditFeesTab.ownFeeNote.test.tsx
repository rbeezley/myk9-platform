import { renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';

vi.mock('@/components/ui/tabs', () => import('../../../common/__tests__/mockTabs'));

const replica = vi.hoisted(() => ({
  getTrialsByShow: vi.fn(),
  getClassesByTrial: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
}));
vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: { getTrialsByShow: replica.getTrialsByShow },
  replicatedClassesTable: {
    getClassesByTrial: replica.getClassesByTrial,
    subscribe: replica.subscribe,
  },
}));

import { ShowEditFeesTab } from '../ShowEditFeesTab';
import { useShowClassOwnFees } from '@/components/classes/useShowClassOwnFees';
import type { ShowEditFormData } from '../ShowEditPanel.types';

const data: ShowEditFormData = {
  id: 'show-1',
  name: 'Test Show',
  status: 'draft',
  organization: 'AKC',
  clubId: 'c1',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  location: 'Dogtown',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-04-15',
  preEntryFee: '25',
  dayOfShowFee: '30',
  assignedJudges: [],
  acceptCheckPayments: false,
  acceptCashPayments: false,
  style: 'monogram',
};

function classesWithFees(prefix: string, fees: Array<number | undefined>, deleted = false) {
  return fees.map((entryFee, index) => ({
    id: `${prefix}-${index}`,
    entryFee,
    ...(deleted && { deletedAt: '2026-11-01' }),
  }));
}

describe("the show's fee note on classes with their own fee (MYK9-1931)", () => {
  beforeEach(() => {
    replica.getTrialsByShow.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
  });

  it('counts only classes with a fee above zero, across trials, leaving deleted ones out', async () => {
    replica.getClassesByTrial.mockImplementation(async (trialId: string) =>
      trialId === 't1'
        ? [...classesWithFees('a', [40, 0, undefined]), ...classesWithFees('d', [35], true)]
        : classesWithFees('b', [30, 25])
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useShowClassOwnFees('show-1'), { wrapper });

    await waitFor(() =>
      expect(result.current).toEqual(
        new Map([
          ['a-0', 40],
          ['b-0', 30],
          ['b-1', 25],
        ])
      )
    );
  });

  it("says how many classes have their own fee beside the show's fees", async () => {
    replica.getClassesByTrial.mockImplementation(async (trialId: string) =>
      trialId === 't1' ? classesWithFees('a', [40, undefined]) : classesWithFees('b', [35, 30])
    );

    render(<ShowEditFeesTab data={data} handleCheckboxChange={vi.fn(() => vi.fn())} />);

    expect(await screen.findByText('3 classes have their own fee.')).toBeInTheDocument();
  });

  it('says nothing when every class charges the show fee', async () => {
    replica.getClassesByTrial.mockResolvedValue(classesWithFees('a', [undefined, 0]));

    render(<ShowEditFeesTab data={data} handleCheckboxChange={vi.fn(() => vi.fn())} />);

    await waitFor(() => expect(replica.getClassesByTrial).toHaveBeenCalled());
    expect(screen.queryByText(/have their own fee|has its own fee/)).not.toBeInTheDocument();
  });
});
