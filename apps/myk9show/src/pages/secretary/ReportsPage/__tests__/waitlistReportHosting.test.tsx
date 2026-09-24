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
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGetWaitlistReportRows } = vi.hoisted(() => ({ mockGetWaitlistReportRows: vi.fn() }));

vi.mock('@/services/database/waitlists', () => ({
  getWaitlistReportRows: mockGetWaitlistReportRows,
}));

import { useHostedReportData } from '../useHostedReportData';
import { buildShowReportProps } from '../reportDataMapping';
import { reportRegistry } from '@/lib/reports/reportRegistry';
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
  return renderHook(
    () => useHostedReportData({ reportType: 'waitlist-report', showId: 'show-1' }),
    { wrapper: wrapper(client) }
  );
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
  beforeEach(() => vi.clearAllMocks());

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
});
