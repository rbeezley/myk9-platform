/**
 * MYK9-717: the Waitlist Report, end to end through the host. The waitlist is
 * fetched by `useHostedReportData` (where the providers live), carried through
 * `buildShowReportProps`, and rendered the way `ReportPreview` renders it —
 * `renderToStaticMarkup`, with no provider context. The show has NO waitlisted
 * `entries` rows, because the status constraint forbids them.
 */
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGetWaitlistReportRows, hydration } = vi.hoisted(() => ({
  mockGetWaitlistReportRows: vi.fn(),
  hydration: { revision: 0, listeners: new Set<() => void>() },
}));

vi.mock('@/services/database/waitlists', () => ({
  getWaitlistReportRows: mockGetWaitlistReportRows,
}));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  getHandlerPeopleHydrationRevision: () => hydration.revision,
  subscribeHandlerPeopleHydration: (listener: () => void) => {
    hydration.listeners.add(listener);
    return () => hydration.listeners.delete(listener);
  },
}));

import { useHostedReportData } from '../useHostedReportData';
import { ReportPreview } from '../ReportPreview';
import { buildShowReportProps } from '../reportDataMapping';
import { reportRegistry } from '@/lib/reports/reportRegistry';
import { queryKeys } from '@/lib/queryClient';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const show = { id: 'show-1', name: 'Spring Trial', organization: 'AKC' } as Show;
const trials = [
  { id: 'trial-1', name: 'Saturday Trial', date: '2026-04-12', trial_number: 1 },
] as unknown as DbTrial[];
const classes = [
  { id: 'class-1', trial_id: 'trial-1', element: 'Container', level: 'Novice', section: 'A' },
] as unknown as DbClass[];
const confirmedEntry = {
  id: 'entry-1',
  class_id: 'class-1',
  entry_status: 'confirmed',
  handler: 'Carlos Rivera',
  dog: { call_name: 'Max' },
} as unknown as DbEntry;

const waitlistReport = reportRegistry.find(r => r.id === 'waitlist-report')!;

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderHosted() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hook = renderHook(
    () => useHostedReportData({ reportType: 'waitlist-report', showId: 'show-1' }),
    { wrapper: wrapper(client) }
  );
  return { ...hook, client };
}

function renderReportMarkup(hosted: ReturnType<typeof useHostedReportData>): string {
  const props = buildShowReportProps({
    report: waitlistReport,
    show,
    trials,
    classes,
    entries: [confirmedEntry],
    trialId: 'all',
    classId: 'all',
    dogId: 'all',
    sortOrder: '',
    ...(hosted.waitlist ? { waitlist: hosted.waitlist } : {}),
  });
  const Component = waitlistReport.component;
  return ReactDOMServer.renderToStaticMarkup(<Component {...props} />);
}

describe('Waitlist Report hosting (MYK9-717)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hydration.revision = 0;
    hydration.listeners.clear();
  });

  it('prints the waitlisted dogs of a show, not its confirmed entries', async () => {
    mockGetWaitlistReportRows.mockResolvedValue([
      { id: 'wl-1', classId: 'class-1', position: 1, callName: 'Buddy', handler: 'Jane Mitchell' },
    ]);
    const { result } = renderHosted();

    expect(result.current.isHostedDataPending).toBe(true);
    await waitFor(() => expect(result.current.isHostedDataPending).toBe(false));
    expect(mockGetWaitlistReportRows).toHaveBeenCalledWith('show-1');

    const markup = renderReportMarkup(result.current);
    expect(markup).toContain('Container Novice A');
    expect(markup).toContain('Buddy');
    expect(markup).toContain('Jane Mitchell');
    expect(markup).not.toContain('Max');
    expect(markup).not.toContain('No dogs are on a waitlist');
  });

  it('prints a load failure, never an empty waitlist, when the read fails', async () => {
    mockGetWaitlistReportRows.mockRejectedValue(new Error('offline and not cached'));
    const { result } = renderHosted();

    await waitFor(() => expect(result.current.waitlist?.isError).toBe(true));
    const markup = renderReportMarkup(result.current);
    expect(markup).toMatch(/couldn(&#x27;|')t load the waitlist/i);
    expect(markup).not.toContain('No dogs are on a waitlist');
  });

  it('does not read the waitlist for other reports', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useHostedReportData({ reportType: 'financial-report', showId: 'show-1' }), {
      wrapper: wrapper(client),
    });
    expect(mockGetWaitlistReportRows).not.toHaveBeenCalled();
  });

  it('previews a waitlist for a show with no confirmed entries yet', async () => {
    mockGetWaitlistReportRows.mockResolvedValue([
      { id: 'wl-1', classId: 'class-1', position: 1, callName: 'Buddy', handler: 'Jane Mitchell' },
    ]);
    const { container } = render(
      <ReportPreview
        reportType="waitlist-report"
        show={show}
        trials={trials}
        classes={classes}
        entries={[]}
        trialId="all"
        classId="all"
        dogId="all"
        sortOrder=""
        isLoading={false}
        isError={false}
        dataState="ready"
      />
    );

    expect(screen.queryByText(/No entries found/i)).toBeNull();
    const frame = container.querySelector('iframe') as HTMLIFrameElement;
    await waitFor(() => expect(frame.contentDocument?.body.textContent).toContain('Buddy'));
  });

  it('re-reads after a waitlist mutation invalidates the show', async () => {
    mockGetWaitlistReportRows.mockResolvedValueOnce([
      { id: 'wl-1', classId: 'class-1', position: 1, callName: 'Buddy', handler: null },
    ]);
    const { result, client } = renderHosted();
    await waitFor(() => expect(result.current.waitlist?.data).toHaveLength(1));

    // What useWaitListMutations does after promote / remove / close.
    mockGetWaitlistReportRows.mockResolvedValueOnce([]);
    await act(() => client.invalidateQueries({ queryKey: queryKeys.show('show-1') }));

    await waitFor(() => expect(result.current.waitlist?.data).toEqual([]));
    expect(mockGetWaitlistReportRows).toHaveBeenCalledTimes(2);
  });

  it('re-reads when handler names finish hydrating in the background', async () => {
    mockGetWaitlistReportRows.mockResolvedValueOnce([
      { id: 'wl-1', classId: 'class-1', position: 1, callName: 'Buddy', handler: null },
    ]);
    const { result } = renderHosted();
    await waitFor(() => expect(result.current.waitlist?.data[0]?.callName).toBe('Buddy'));
    expect(mockGetWaitlistReportRows).toHaveBeenCalledTimes(1);

    mockGetWaitlistReportRows.mockResolvedValueOnce([
      { id: 'wl-1', classId: 'class-1', position: 1, callName: 'Buddy', handler: 'Jane Mitchell' },
    ]);
    act(() => {
      hydration.revision += 1;
      hydration.listeners.forEach(listener => listener());
    });

    await waitFor(() => expect(result.current.waitlist?.data[0]?.handler).toBe('Jane Mitchell'));
  });
});
