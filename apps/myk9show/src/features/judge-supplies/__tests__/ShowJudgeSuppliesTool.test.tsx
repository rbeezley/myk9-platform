import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';

const byTrial = new Map([
  ['t1', [{ person_id: 'j1', judge_name: 'Jane Judge' }]],
  [
    't2',
    [
      { person_id: 'j1', judge_name: 'Jane Judge' },
      { person_id: 'j2', judge_name: 'Sam Steward' },
    ],
  ],
]);

vi.mock('@/features/lunch-orders/judgesOnDays', () => ({
  useJudgesOnDays: () => ({
    byTrial,
    hasData: true,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('../trialJudgeSuppliesService', () => ({
  trialJudgeSuppliesService: { listForShow: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../useTrialRegistry', () => ({
  useTrialRegistry: () => ({ data: 'AKC' }),
}));
const dialog = vi.fn();
vi.mock('../ManageJudgeSuppliesDialog', () => ({
  ManageJudgeSuppliesDialog: (props: Record<string, unknown>) => {
    dialog(props);
    return <div data-testid="manage-dialog" />;
  },
}));

import { ShowJudgeSuppliesTool } from '../ShowJudgeSuppliesTool';

const trials = [
  { id: 't1', name: 'Trial 1' },
  { id: 't2', name: 'Trial 2' },
];

describe('ShowJudgeSuppliesTool (MYK9-1728)', () => {
  it('lists a judge on two trials once, naming both trials', async () => {
    render(<ShowJudgeSuppliesTool showId="show-1" trials={trials} />);
    expect(await screen.findAllByRole('button', { name: /edit supplies for/i })).toHaveLength(2);
    expect(screen.getAllByText('Jane Judge')).toHaveLength(1);
    const row = screen.getByTestId('judge-row-j1');
    expect(row).toHaveTextContent('Trial 1');
    expect(row).toHaveTextContent('Trial 2');
    expect(screen.getByTestId('judge-row-j2')).not.toHaveTextContent('Trial 1');
  });

  it('Edit opens the manage dialog on the first trial and mirrors the rest', async () => {
    const { user } = render(<ShowJudgeSuppliesTool showId="show-1" trials={trials} />);
    await user.click(await screen.findByRole('button', { name: 'Edit supplies for Jane Judge' }));
    await waitFor(() => expect(screen.getByTestId('manage-dialog')).toBeInTheDocument());
    expect(dialog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        trialId: 't1',
        mirrorTrialIds: ['t2'],
        registryId: 'AKC',
        judge: expect.objectContaining({ person_id: 'j1' }),
      })
    );
  });
});
