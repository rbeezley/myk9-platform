import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

vi.mock('@/features/judge-supplies/trialJudgeSuppliesService', () => ({
  trialJudgeSuppliesService: {
    listForShow: vi.fn(),
  },
}));

import { JudgeSupplyChecklistReport } from '../JudgeSupplyChecklistReport';
import { useHostedReportData } from '@/pages/secretary/ReportsPage/useHostedReportData';
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

const wrapper =
  (client: QueryClient) =>
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

/**
 * MYK9-280: the component no longer fetches. `ReportPreview` renders it through
 * `ReactDOMServer.renderToStaticMarkup`, which has no provider context, so a
 * React Query hook here threw `No QueryClient set` and the report was unreachable.
 * The host resolves the rows and passes them in — so these tests hand the data
 * straight to the component, with no provider and no service mock in the way.
 */
function renderReport(
  rows: TrialJudgeSupplyRow[],
  state: { isLoading?: boolean; isError?: boolean } = {},
  over: Partial<ReportProps> = {}
) {
  return render(
    <JudgeSupplyChecklistReport
      {...baseProps(over)}
      judgeSupplies={{
        data: rows,
        isLoading: state.isLoading ?? false,
        isError: state.isError ?? false,
      }}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('JudgeSupplyChecklistReport', () => {
  it('shows a context-required notice when showId is missing', () => {
    renderReport([], {}, { showId: undefined });
    expect(screen.getByText(/show context is required/i)).toBeInTheDocument();
  });

  it('shows the loading state while supplies are fetching', () => {
    renderReport([], { isLoading: true });
    expect(screen.getByText(/loading judge supplies/i)).toBeInTheDocument();
  });

  it('shows the empty state when no supplies are configured', () => {
    renderReport([]);
    expect(screen.getByText(/no judge supplies have been configured/i)).toBeInTheDocument();
  });

  it('renders one page per (trial, judge) pair sorted by date then trial number then judge name', () => {
    renderReport([
      row({ id: 'a', trial_id: 't2', judge_name: 'Carol', sort_order: 10 }),
      row({ id: 'b', trial_id: 't1', judge_name: 'Bob', person_id: null, sort_order: 10 }),
      row({ id: 'c', trial_id: 't1', judge_name: 'Alice', person_id: 'p1', sort_order: 10 }),
    ]);

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

  it('lists only included items, sorted by sort_order, with note column populated', () => {
    renderReport([
      row({ id: 'a', item_label: 'Highlighter', sort_order: 30, included: false }),
      row({ id: 'b', item_label: 'Clipboard', sort_order: 10, included: true, note: 'left ring' }),
      row({ id: 'c', item_label: 'Pens (2)', sort_order: 20, included: true }),
    ]);

    const tableRows = screen.getAllByRole('row');
    // 1 header row + 2 included items (Highlighter excluded).
    expect(tableRows).toHaveLength(3);
    expect(tableRows[1].textContent).toContain('Clipboard');
    expect(tableRows[1].textContent).toContain('left ring');
    expect(tableRows[2].textContent).toContain('Pens (2)');
    expect(screen.queryByText('Highlighter')).not.toBeInTheDocument();
  });

  it('renders the all-excluded message when every row is excluded', () => {
    renderReport([
      row({ id: 'a', item_label: 'Clipboard', included: false }),
      row({ id: 'b', item_label: 'Pen', included: false }),
    ]);
    expect(screen.getByText(/all template items have been excluded/i)).toBeInTheDocument();
  });
});

/**
 * The N+1 guard moved with the fetch. It still matters — it just belongs to the
 * host now, since that is the only thing that talks to the service.
 */
describe('useHostedReportData — judge supplies', () => {
  it('fetches supplies exactly once, for the requested show', async () => {
    mockListForShow.mockResolvedValue([
      row({ id: 'a', trial_id: 't1', judge_name: 'Alice' }),
      row({ id: 'b', trial_id: 't1', judge_name: 'Bob' }),
      row({ id: 'c', trial_id: 't2', judge_name: 'Carol' }),
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(
      () => useHostedReportData({ reportType: 'judge-supply-checklist', showId: 'show-1' }),
      { wrapper: wrapper(client) }
    );

    await waitFor(() => expect(result.current.isHostedDataPending).toBe(false));
    expect(mockListForShow).toHaveBeenCalledTimes(1);
    expect(mockListForShow).toHaveBeenCalledWith('show-1');
    expect(result.current.judgeSupplies?.data).toHaveLength(3);
  });

  it('does not fetch for a report that does not need supplies', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useHostedReportData({ reportType: 'check-in-sheet', showId: 'show-1' }), {
      wrapper: wrapper(client),
    });
    expect(mockListForShow).not.toHaveBeenCalled();
  });
});
