/**
 * MYK9-717: Print on ReportsPage waits for the data a hosted report loads for
 * itself — on the first load and on a background refresh — through the one
 * `isHostedDataBusy` signal from `useHostedReportData`. The real hook runs here;
 * only its data sources are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { act, createTestQueryClient, render, screen, waitFor } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import ReportsPage from '../index';

const mocks = vi.hoisted(() => ({
  getWaitlistReportRows: vi.fn(),
  listForShow: vi.fn(),
  printIframe: vi.fn(() => true),
  toast: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => mocks.toast(...args), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    dismiss: vi.fn(),
  }),
  Toaster: () => null,
}));

vi.mock('@/services/database/waitlists', () => ({
  getWaitlistReportRows: mocks.getWaitlistReportRows,
}));
vi.mock('@/features/judge-supplies/trialJudgeSuppliesService', () => ({
  trialJudgeSuppliesService: { listForShow: mocks.listForShow },
}));
vi.mock('../reportPreviewUtils', () => ({ printIframe: mocks.printIframe }));
// Stands in for the preview: shows what the host handed it, so a test can see
// the waitlist rows (or the error) the printable report would render.
vi.mock('../ReportPreview', () => ({
  ReportPreview: (props: {
    hosted?: { waitlist?: { data: Array<{ callName: string }>; isError: boolean } };
  }) => (
    <div data-testid="report-preview">
      {props.hosted?.waitlist?.isError
        ? 'waitlist-error'
        : (props.hosted?.waitlist?.data ?? []).map(row => row.callName).join(',')}
    </div>
  ),
}));

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: { id: 'show-1', name: 'Spring Trial' },
    isLoading: false,
    isError: false,
    hasData: true,
  }),
}));
vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: { id: 'show-1', name: 'Spring Trial' },
    trials: [{ id: 'trial-1', name: 'Trial 1', trial_number: 1, date: '2026-04-12' }],
    classes: [{ id: 'class-1', trial_id: 'trial-1', element: 'Buried', level: 'Novice' }],
    entries: [],
    dataState: 'ready',
    isReady: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/useEntryFormData', () => ({
  useEntryFormData: () => ({
    dogs: [],
    secretary: null,
    trials: [],
    classes: [],
    show: null,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));
vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({ data: [], isLoading: false, isError: false, syncFailed: false }),
}));

const WAITLIST_ROW = {
  id: 'wl-1',
  classId: 'class-1',
  position: 1,
  callName: 'Buddy',
  handler: null,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

function renderReport(report: string) {
  const queryClient = createTestQueryClient();
  render(<ReportsPage />, { initialRoute: `/shows/show-1/reports?report=${report}`, queryClient });
  return queryClient;
}

const printButton = () => screen.getByRole('button', { name: /^print$/i });

describe('ReportsPage Print gate for hosted reports (MYK9-717)', () => {
  afterEach(() => onlineManager.setOnline(true));

  beforeEach(() => {
    vi.restoreAllMocks();
    // A replica that has synced before, unless a test says otherwise.
    vi.spyOn(replicatedWaitlistEntriesTable, 'getSyncMetadata').mockResolvedValue({
      tableName: 'waitlist_entries',
      lastFullSyncAt: 1,
      lastIncrementalSyncAt: 1,
      totalRows: 1,
    });
    mocks.getWaitlistReportRows.mockReset();
    mocks.listForShow.mockReset();
    mocks.printIframe.mockClear();
    mocks.toast.mockClear();
  });

  it('blocks Print while the waitlist is loading for the first time', async () => {
    const rows = deferred<unknown[]>();
    mocks.getWaitlistReportRows.mockReturnValue(rows.promise);
    renderReport('waitlist-report');

    await waitFor(() => expect(mocks.getWaitlistReportRows).toHaveBeenCalledWith('show-1'));
    expect(printButton()).toBeDisabled();
    await userEvent.click(printButton());
    expect(mocks.printIframe).not.toHaveBeenCalled();

    await act(async () => rows.resolve([WAITLIST_ROW]));
    await waitFor(() => expect(printButton()).toBeEnabled());
    await userEvent.click(printButton());
    expect(mocks.printIframe).toHaveBeenCalledTimes(1);
  });

  it('blocks Print during the background refresh a promote triggers', async () => {
    mocks.getWaitlistReportRows.mockResolvedValueOnce([WAITLIST_ROW]);
    const queryClient = renderReport('waitlist-report');
    await waitFor(() => expect(printButton()).toBeEnabled());

    // useWaitListMutations invalidates queryKeys.show(showId) after a promote.
    const refreshed = deferred<unknown[]>();
    mocks.getWaitlistReportRows.mockReturnValueOnce(refreshed.promise);
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.show('show-1') });
    });

    await waitFor(() => expect(printButton()).toBeDisabled());
    await userEvent.click(printButton());
    expect(mocks.printIframe).not.toHaveBeenCalled();

    await act(async () => refreshed.resolve([]));
    await waitFor(() => expect(printButton()).toBeEnabled());
  });

  it('blocks Print while the judge supply checklist is loading for the first time', async () => {
    const supplies = deferred<unknown[]>();
    mocks.listForShow.mockReturnValue(supplies.promise);
    renderReport('judge-supply-checklist');

    await waitFor(() => expect(mocks.listForShow).toHaveBeenCalledWith('show-1'));
    expect(printButton()).toBeDisabled();
    await userEvent.click(printButton());
    expect(mocks.printIframe).not.toHaveBeenCalled();

    await act(async () => supplies.resolve([]));
    await waitFor(() => expect(printButton()).toBeEnabled());
  });

  it('refetches when the replica catches up after the server invalidation, blocking Print meanwhile', async () => {
    const waitlistListeners: Array<() => void> = [];
    vi.spyOn(replicatedWaitlistEntriesTable, 'subscribe').mockImplementation(listener => {
      waitlistListeners.push(listener as () => void);
      return () => {};
    });
    const OLD = [WAITLIST_ROW];
    const NEW = [{ ...WAITLIST_ROW, id: 'wl-2', callName: 'Rex' }];
    mocks.getWaitlistReportRows.mockResolvedValue(OLD);
    const queryClient = renderReport('waitlist-report');
    await waitFor(() => expect(printButton()).toBeEnabled());

    // The promote's server answer invalidates the show; the replica still holds OLD.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.show('show-1') });
    });
    await waitFor(() => expect(printButton()).toBeEnabled());
    const readsBeforeSync = mocks.getWaitlistReportRows.mock.calls.length;

    // The replica then syncs the promote and notifies its subscribers.
    const synced = deferred<unknown[]>();
    mocks.getWaitlistReportRows.mockReturnValueOnce(synced.promise);
    expect(waitlistListeners.length).toBeGreaterThan(0);
    act(() => waitlistListeners.forEach(listener => listener()));

    await waitFor(() => expect(printButton()).toBeDisabled());
    expect(mocks.getWaitlistReportRows.mock.calls.length).toBe(readsBeforeSync + 1);
    await act(async () => synced.resolve(NEW));
    await waitFor(() => expect(printButton()).toBeEnabled());
    expect(queryClient.getQueryData(queryKeys.showWaitlistReport('show-1'))).toEqual(NEW);
  });

  it('offline, reads the waitlist from the replica and prints its rows', async () => {
    onlineManager.setOnline(false);
    mocks.getWaitlistReportRows.mockResolvedValue([WAITLIST_ROW]);
    renderReport('waitlist-report');

    await waitFor(() => expect(screen.getByTestId('report-preview')).toHaveTextContent('Buddy'));
    expect(mocks.getWaitlistReportRows).toHaveBeenCalledWith('show-1');
    expect(printButton()).toBeEnabled();
    await userEvent.click(printButton());
    expect(mocks.printIframe).toHaveBeenCalledTimes(1);
  });

  it('blocks Print while a hosted query is paused offline and has never run', async () => {
    onlineManager.setOnline(false);
    mocks.listForShow.mockResolvedValue([]);
    renderReport('judge-supply-checklist');

    // A network query parks at fetchStatus 'paused' offline without calling its queryFn.
    await act(async () => {});
    expect(mocks.listForShow).not.toHaveBeenCalled();
    expect(printButton()).toBeDisabled();

    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(printButton()).toBeEnabled());
  });

  it('reports a never-synced waitlist replica as not loaded, never as an empty waitlist', async () => {
    vi.spyOn(replicatedWaitlistEntriesTable, 'getSyncMetadata').mockResolvedValue(null);
    mocks.getWaitlistReportRows.mockResolvedValue([]);
    renderReport('waitlist-report');

    await waitFor(() =>
      expect(screen.getByTestId('report-preview')).toHaveTextContent('waitlist-error')
    );
  });
});
