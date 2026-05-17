import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../useTrialJudges', () => ({
  useTrialJudges: vi.fn(),
}));

vi.mock('../useTrialRegistry', () => ({
  useTrialRegistry: vi.fn(),
}));

vi.mock('../useTrialJudgeSupplies', () => ({
  useTrialJudgeSupplies: vi.fn(),
}));

vi.mock('../ManageJudgeSuppliesDialog', () => ({
  ManageJudgeSuppliesDialog: ({
    open,
    judge,
  }: {
    open: boolean;
    judge: { judge_name: string };
  }) =>
    open ? <div data-testid="dialog-stub">Dialog open for {judge.judge_name}</div> : null,
}));

import { JudgeSuppliesSection } from '../JudgeSuppliesSection';
import * as useTrialJudgesMod from '../useTrialJudges';
import * as useTrialRegistryMod from '../useTrialRegistry';
import * as useTrialJudgeSuppliesMod from '../useTrialJudgeSupplies';
import type { TrialJudgeSupplyRow } from '../types';

const mockUseTrialJudges = vi.mocked(useTrialJudgesMod.useTrialJudges);
const mockUseTrialRegistry = vi.mocked(useTrialRegistryMod.useTrialRegistry);
const mockUseTrialJudgeSupplies = vi.mocked(useTrialJudgeSuppliesMod.useTrialJudgeSupplies);

function row(overrides: Partial<TrialJudgeSupplyRow>): TrialJudgeSupplyRow {
  return {
    id: overrides.id ?? `r-${Math.random()}`,
    trial_id: 'trial-1',
    person_id: 'p1',
    judge_name: 'Alice',
    item_label: 'Clipboard',
    included: true,
    note: null,
    sort_order: 10,
    is_custom: false,
    created_at: '2026-05-16T00:00:00Z',
    updated_at: '2026-05-16T00:00:00Z',
    ...overrides,
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTrialRegistry.mockReturnValue({ data: 'AKC' } as unknown as ReturnType<
    typeof useTrialRegistryMod.useTrialRegistry
  >);
  mockUseTrialJudgeSupplies.mockReturnValue({
    rows: [],
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useTrialJudgeSuppliesMod.useTrialJudgeSupplies>);
});

describe('JudgeSuppliesSection', () => {
  it('shows the loading state while judges are loading', () => {
    mockUseTrialJudges.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useTrialJudgesMod.useTrialJudges>);

    render(<JudgeSuppliesSection trialId="trial-1" />, { wrapper });
    expect(screen.getByText(/loading judges/i)).toBeInTheDocument();
  });

  it('shows the empty state when the trial has no judges', () => {
    mockUseTrialJudges.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useTrialJudgesMod.useTrialJudges>);

    render(<JudgeSuppliesSection trialId="trial-1" />, { wrapper });
    expect(screen.getByTestId('judge-supplies-empty')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('lists each judge with item count summary', () => {
    mockUseTrialJudges.mockReturnValue({
      data: [
        { person_id: 'p1', judge_name: 'Alice' },
        { person_id: null, judge_name: 'Bob' },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useTrialJudgesMod.useTrialJudges>);
    mockUseTrialJudgeSupplies.mockReturnValue({
      rows: [
        row({ id: 'a', person_id: 'p1', judge_name: 'Alice', is_custom: false, included: true }),
        row({ id: 'b', person_id: 'p1', judge_name: 'Alice', is_custom: true, included: false }),
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useTrialJudgeSuppliesMod.useTrialJudgeSupplies>);

    render(<JudgeSuppliesSection trialId="trial-1" />, { wrapper });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Alice: 2 items, 1 custom, 1 excluded
    expect(screen.getByText(/2 items · 1 custom · 1 excluded/i)).toBeInTheDocument();
    // Bob: no rows yet → "Not configured yet"
    expect(screen.getByText('Not configured yet')).toBeInTheDocument();
  });

  it('opens the manage dialog when Edit is clicked', async () => {
    const user = userEvent.setup();
    mockUseTrialJudges.mockReturnValue({
      data: [{ person_id: 'p1', judge_name: 'Alice' }],
      isLoading: false,
    } as unknown as ReturnType<typeof useTrialJudgesMod.useTrialJudges>);

    render(<JudgeSuppliesSection trialId="trial-1" />, { wrapper });
    expect(screen.queryByTestId('dialog-stub')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit supplies for alice/i }));
    expect(screen.getByTestId('dialog-stub')).toHaveTextContent('Dialog open for Alice');
  });

  it('uses singular "item" when the count is 1', () => {
    mockUseTrialJudges.mockReturnValue({
      data: [{ person_id: 'p1', judge_name: 'Alice' }],
      isLoading: false,
    } as unknown as ReturnType<typeof useTrialJudgesMod.useTrialJudges>);
    mockUseTrialJudgeSupplies.mockReturnValue({
      rows: [row({ id: 'a', person_id: 'p1', judge_name: 'Alice' })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useTrialJudgeSuppliesMod.useTrialJudgeSupplies>);

    render(<JudgeSuppliesSection trialId="trial-1" />, { wrapper });
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });
});
