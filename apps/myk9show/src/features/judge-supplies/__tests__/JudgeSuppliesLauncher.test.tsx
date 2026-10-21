import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../useTrialJudges', () => ({
  useTrialJudges: () => ({ data: [{ person_id: 'p1', judge_name: 'Alice' }], isLoading: false }),
}));
vi.mock('../useTrialRegistry', () => ({ useTrialRegistry: () => ({ data: 'AKC' }) }));
vi.mock('../useTrialJudgeSupplies', () => ({
  useTrialJudgeSupplies: () => ({ rows: [], isLoading: false, error: null }),
}));
vi.mock('../ManageJudgeSuppliesDialog', () => ({
  ManageJudgeSuppliesDialog: ({
    judge,
    trialId,
  }: {
    judge: { judge_name: string };
    trialId: string;
  }) => (
    <div data-testid="manage-dialog">
      {judge.judge_name} on {trialId}
    </div>
  ),
}));

import { JudgeSuppliesLauncher } from '../JudgeSuppliesLauncher';

describe('JudgeSuppliesLauncher (MYK9-1320)', () => {
  it('lists the trial judges, and Edit opens the supplies editor for that judge and trial', async () => {
    const user = userEvent.setup();
    render(<JudgeSuppliesLauncher trialId="trial-9" onClose={vi.fn()} />);

    expect(await screen.findByRole('dialog', { name: 'Judge supplies' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit supplies for Alice' }));

    expect(screen.getByTestId('manage-dialog')).toHaveTextContent('Alice on trial-9');
  });
});
