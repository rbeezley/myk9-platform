import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/features/judge-supplies/trialJudgeSuppliesService', () => ({
  trialJudgeSuppliesService: {
    listForShow: vi.fn(),
  },
}));

import { JudgeSupplyChecklistReport } from '../JudgeSupplyChecklistReport';
import { trialJudgeSuppliesService } from '@/features/judge-supplies/trialJudgeSuppliesService';
import type { TrialJudgeSupplyRow } from '@/features/judge-supplies/types';
import type { ReportProps } from '@/lib/reports/types';

const mockListForShow = vi.mocked(trialJudgeSuppliesService.listForShow);

function row(overrides: Partial<TrialJudgeSupplyRow>): TrialJudgeSupplyRow {
  return {
    id: overrides.id ?? `r-${Math.random()}`,
    trial_id: 't1',
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

const wrapper = (client: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

function baseProps(over: Partial<ReportProps> = {}): ReportProps {
  return {
    showId: 'show-1',
    showName: 'Spring Trial',
    entries: [],
    sortOrder: '',
    allTrials: [
      { id: 't1', date: '2026-06-12', trialNumber: '1' },
      { id: 't2', date: '2026-06-13', trialNumber: '2' },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('JudgeSupplyChecklistReport', () => {
  it('shows a context-required notice when showId is missing', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<JudgeSupplyChecklistReport {...baseProps({ showId: undefined })} />, {
      wrapper: wrapper(client),
    });
    expect(screen.getByText(/show context is required/i)).toBeInTheDocument();
    expect(mockListForShow).not.toHaveBeenCalled();
  });

  it('shows the loading state while supplies are fetching', () => {
    mockListForShow.mockImplementation(() => new Promise(() => {}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<JudgeSupplyChecklistReport {...baseProps()} />, { wrapper: wrapper(client) });
    expect(screen.getByText(/loading judge supplies/i)).toBeInTheDocument();
  });

  it('shows the empty state when no supplies are configured', async () => {
    mockListForShow.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<JudgeSupplyChecklistReport {...baseProps()} />, { wrapper: wrapper(client) });

    await waitFor(() =>
      expect(screen.getByText(/no judge supplies have been configured/i)).toBeInTheDocument()
    );
  });

  it('renders one page per (trial, judge) pair sorted by date then trial number then judge name', async () => {
    mockListForShow.mockResolvedValue([
      row({ id: 'a', trial_id: 't2', judge_name: 'Carol', sort_order: 10 }),
      row({ id: 'b', trial_id: 't1', judge_name: 'Bob', person_id: null, sort_order: 10 }),
      row({ id: 'c', trial_id: 't1', judge_name: 'Alice', person_id: 'p1', sort_order: 10 }),
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<JudgeSupplyChecklistReport {...baseProps()} />, { wrapper: wrapper(client) });

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    // Three judges → three pages.
    expect(screen.getAllByText(/judge supply checklist/i).length).toBe(3);
    // Sorted: t1 (2026-06-12) Alice, t1 Bob, t2 (2026-06-13) Carol.
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(headings[0]).toContain('Trial 1');
    expect(headings[1]).toContain('Trial 1');
    expect(headings[2]).toContain('Trial 2');
    const judgeNames = screen.getAllByText(/^Judge: /).map(p => p.textContent);
    expect(judgeNames).toEqual(['Judge: Alice', 'Judge: Bob', 'Judge: Carol']);
  });

  it('lists only included items, sorted by sort_order, with note column populated', async () => {
    mockListForShow.mockResolvedValue([
      row({ id: 'a', item_label: 'Highlighter', sort_order: 30, included: false }),
      row({ id: 'b', item_label: 'Clipboard', sort_order: 10, included: true, note: 'left ring' }),
      row({ id: 'c', item_label: 'Pens (2)', sort_order: 20, included: true }),
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<JudgeSupplyChecklistReport {...baseProps()} />, { wrapper: wrapper(client) });

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    const tableRows = screen.getAllByRole('row');
    // 1 header row + 2 included items (Highlighter excluded).
    expect(tableRows).toHaveLength(3);
    expect(tableRows[1].textContent).toContain('Clipboard');
    expect(tableRows[1].textContent).toContain('left ring');
    expect(tableRows[2].textContent).toContain('Pens (2)');
    expect(screen.queryByText('Highlighter')).not.toBeInTheDocument();
  });

  it('renders the all-excluded message when every row is excluded', async () => {
    mockListForShow.mockResolvedValue([
      row({ id: 'a', item_label: 'Clipboard', included: false }),
      row({ id: 'b', item_label: 'Pen', included: false }),
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<JudgeSupplyChecklistReport {...baseProps()} />, { wrapper: wrapper(client) });

    await waitFor(() =>
      expect(screen.getByText(/all template items have been excluded/i)).toBeInTheDocument()
    );
  });

  it('fetches supplies exactly once per render (N+1 guard)', async () => {
    mockListForShow.mockResolvedValue([
      row({ id: 'a', trial_id: 't1', judge_name: 'Alice' }),
      row({ id: 'b', trial_id: 't1', judge_name: 'Bob' }),
      row({ id: 'c', trial_id: 't2', judge_name: 'Carol' }),
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<JudgeSupplyChecklistReport {...baseProps()} />, { wrapper: wrapper(client) });

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    expect(mockListForShow).toHaveBeenCalledTimes(1);
    expect(mockListForShow).toHaveBeenCalledWith('show-1');
  });
});
