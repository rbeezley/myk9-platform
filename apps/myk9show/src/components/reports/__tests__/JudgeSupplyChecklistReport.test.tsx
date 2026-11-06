import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

vi.mock('@/features/judge-supplies/showJudgeSuppliesService', () => ({
  showJudgeSuppliesService: {
    listForShow: vi.fn(),
  },
}));

import { JudgeSupplyChecklistReport } from '../JudgeSupplyChecklistReport';
import { useHostedReportData } from '@/pages/secretary/ReportsPage/useHostedReportData';
import { showJudgeSuppliesService } from '@/features/judge-supplies/showJudgeSuppliesService';
import type { ShowJudgeSupplyRow } from '@/features/judge-supplies/types';
import type { ReportProps } from '@/lib/reports/types';

const mockListForShow = vi.mocked(showJudgeSuppliesService.listForShow);

function row(overrides: Partial<ShowJudgeSupplyRow>): ShowJudgeSupplyRow {
  return {
    id: overrides.id ?? `r-${Math.random()}`,
    show_id: 'show-1',
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
      { id: 't1', date: '2026-06-12', name: 'Trial 1', trialNumber: 'Trial 1' },
      { id: 't2', date: '2026-06-13', name: 'Trial 2', trialNumber: 'Trial 2' },
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
  rows: ShowJudgeSupplyRow[],
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

  it('renders one page per judge for the show, sorted by judge name', () => {
    renderReport([
      row({ id: 'a', judge_name: 'Carol', person_id: 'p3' }),
      row({ id: 'b', judge_name: 'Bob', person_id: null }),
      row({ id: 'c', judge_name: 'Alice', person_id: 'p1' }),
    ]);

    expect(screen.getAllByText(/judge supply checklist/i).length).toBe(3);
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(headings).toEqual(['Judge: Alice', 'Judge: Bob', 'Judge: Carol']);
  });

  it('gives a judge on two trials one page with one list, not one per trial', () => {
    // The show list holds a judge once; the report must not need the trials to place them.
    renderReport(
      [
        row({ id: 'a', item_label: 'Clipboard', sort_order: 10 }),
        row({ id: 'b', item_label: 'Pens (2)', sort_order: 20 }),
      ],
      {},
      {
        allTrials: [
          { id: 't1', date: '2026-06-12', name: 'Trial 1', trialNumber: 'Trial 1' },
          { id: 't2', date: '2026-06-13', name: 'Trial 2', trialNumber: 'Trial 2' },
        ],
      }
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId('supply-page-p1')).toBeInTheDocument();
    // Header row + the judge's two items.
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.queryByText(/Trial 2/)).not.toBeInTheDocument();
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
      row({ id: 'a', judge_name: 'Alice' }),
      row({ id: 'b', judge_name: 'Bob', person_id: 'p2' }),
      row({ id: 'c', judge_name: 'Carol', person_id: 'p3' }),
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(
      () => useHostedReportData({ reportType: 'judge-supply-checklist', showId: 'show-1' }),
      { wrapper: wrapper(client) }
    );

    await waitFor(() => expect(result.current.hostedState).toBe('ready'));
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
