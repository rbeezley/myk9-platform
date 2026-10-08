import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import ReportsPage from '../index';
import { buildReportPaperworkDescriptor } from '@/features/show-map/cockpit/buildReportPaperworkDescriptor';

const mockReportState = vi.hoisted(() => ({
  trialOneRegistryId: 'AKC',
  isLoading: false,
  /** Overrides the derived state so the paused/stale paths are reachable. */
  dataState: null as null | 'loading' | 'unavailable' | 'stale' | 'error' | 'ready',
}));

/** The rows the page hands the preview, captured so a test can fingerprint exactly what it saw. */
const seenRows = vi.hoisted(() => ({ classes: [] as unknown[], entries: [] as unknown[] }));

const mockPrintState = vi.hoisted(() => ({
  records: [] as Array<Record<string, unknown>>,
  isLoading: false,
  isError: false,
  syncFailed: false,
}));

// The test renderer mounts no <Toaster/>, so a toast never reaches the DOM.
// Assert on what the page asked for instead.
const toastSpy = vi.hoisted(() => ({ called: vi.fn() }));
vi.mock('sonner', () => {
  const toast = Object.assign((...args: unknown[]) => toastSpy.called(...args), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    dismiss: vi.fn(),
    custom: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
  });
  return { toast, Toaster: () => null };
});

const SHOW_TIMEZONE = 'America/Chicago';
const SHOW_DAY = '2026-03-22';
const SHOW_DAY_AFTERNOON = new Date('2026-03-22T18:00:00.000Z');

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: {
      id: 'show-1',
      name: 'Spring Scent Trial 2026',
      startDate: SHOW_DAY,
      endDate: SHOW_DAY,
    },
    isLoading: false,
    isError: false,
    hasData: true,
  }),
}));

vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: { id: 'show-1', name: 'Spring Scent Trial 2026' },
    trials: [
      {
        id: 'trial-1',
        trial_number: 1,
        event_number: '2026123401',
        date: '2026-04-12',
        timezone: SHOW_TIMEZONE,
        registry_id: mockReportState.trialOneRegistryId,
      },
      { id: 'trial-2', trial_number: 2, date: '2026-04-13' },
    ],
    classes: mockReportState.isLoading
      ? undefined
      : [
          {
            id: 'class-1',
            element: 'Buried',
            level: 'Novice',
            section: '',
            trial_id: 'trial-1',
            judge_name: 'Pat Judge',
            time_limit_seconds: 120,
            time_limit_area2_seconds: null,
            time_limit_area3_seconds: null,
            num_areas: 1,
          },
          {
            id: 'class-2',
            element: 'Interior',
            level: 'Advanced',
            section: '',
            trial_id: 'trial-2',
            judge_name: 'Sam Judge',
          },
        ],
    entries: mockReportState.isLoading
      ? undefined
      : [
          {
            id: 'entry-1',
            class_id: 'class-1',
            armband: 101,
            run_order: 1,
            check_in_status: 'checked-in',
            is_scored: false,
            result_status: null,
            search_time_seconds: null,
            total_faults: null,
            final_placement: null,
            entry_fee: null,
            payment_status: null,
            payment_method: null,
            entry_source: null,
            is_day_of_show: false,
            dog: {
              call_name: 'Star',
              breed: 'Golden Retriever',
              owner: { first_name: 'Sarah', last_name: 'Johnson' },
            },
          },
        ],
    // Derived exactly as useReportData derives them, so the mock cannot
    // express a combination the real hook never returns (e.g. dataState
    // 'stale' with isLoading false).
    ...(() => {
      const dataState =
        mockReportState.dataState ?? (mockReportState.isLoading ? 'loading' : 'ready');
      return {
        dataState,
        isReady: dataState === 'ready',
        isLoading: dataState === 'loading' || dataState === 'stale',
        isError: dataState === 'error',
      };
    })(),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/useEntryFormData', () => ({
  useEntryFormData: () => ({
    dogs: [
      {
        dogId: 'dog-1',
        callName: 'Star',
        breed: 'Golden Retriever',
        sex: 'Female',
        dateOfBirth: '2022-03-15',
        registration: {
          registeredName: "GCH Oakwood's Rising Star",
          registrationNumber: 'DN12345678',
          organization: 'AKC',
          variety: null,
        },
        breeder: 'John Doe',
        sire: "CH Oakwood's Golden Boy",
        dam: "Oakwood's Shining Light",
        owner: {
          firstName: 'Sarah',
          lastName: 'Johnson',
          streetAddress: '456 Oak Ave',
          city: 'Dallas',
          state: 'TX',
          zipCode: '75001',
          phone: '(214) 555-0123',
          email: 'sarah@example.com',
        },
        handler: null,
        armband: 101,
        entries: [
          {
            id: 'entry-1',
            trialId: 'trial-1',
            classId: 'class-1',
            element: 'Buried',
            level: 'Novice',
            armband: 101,
            handler: null,
            submittedAt: '2026-04-01T12:00:00Z',
          },
        ],
        agreementDate: '2026-04-01T12:00:00Z',
      },
    ],
    secretary: {
      name: 'Taylor Secretary',
      streetAddress: null,
      city: null,
      state: null,
      zipCode: null,
    },
    trials: [{ id: 'trial-1', date: '2026-04-12', trialNumber: 1 }],
    classes: [],
    show: null,
    isLoading: false,
    isError: false,
    readiness: { hasData: true, isPlaceholderData: false, fetchStatus: 'idle', isError: false },
  }),
}));

vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({
    data: mockPrintState.records,
    isLoading: mockPrintState.isLoading,
    isError: mockPrintState.isError,
    syncFailed: mockPrintState.syncFailed,
  }),
}));

vi.mock('../reportPreviewUtils', () => ({
  printIframe: vi.fn(() => true),
}));

vi.mock('../ReportPreview', () => ({
  ReportPreview: (props: {
    trialId: string;
    classId: string;
    classes?: unknown[];
    entries?: unknown[];
  }) => {
    seenRows.classes = props.classes ?? [];
    seenRows.entries = props.entries ?? [];
    return (
      <div data-testid="report-preview" data-trial-id={props.trialId} data-class-id={props.classId}>
        Preview
      </div>
    );
  },
}));

describe('ReportsPage shows the report phases as visible sections', () => {
  /**
   * REV-2341 R-4: the ordering function and the control bar were both well pinned; the HOP
   * between them was not, and forcing `showPhase` to 'unknown' left every page test green.
   * This renders the real page on a show that is running today and reads the sections off the DOM.
   */
  beforeEach(() => {
    // Freeze only Date. Keeping real timers lets user-event run normally while every render
    // sees one show day.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SHOW_DAY_AFTERNOON);
    mockReportState.trialOneRegistryId = 'AKC';
    mockReportState.isLoading = false;
    mockReportState.dataState = null;
    mockPrintState.records = [];
    mockPrintState.isLoading = false;
    mockPrintState.isError = false;
    mockPrintState.syncFailed = false;
    toastSpy.called.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Mount on the real route so `useParams` resolves the show id the way the app does; the print
  // records are scoped by it.
  const renderPage = () =>
    render(
      <Routes>
        <Route path="/shows/:showId/reports" element={<ReportsPage />} />
      </Routes>,
      { initialRoute: '/shows/show-1/reports' }
    );

  const card = (reportId: string) =>
    document.querySelector<HTMLElement>(`[data-report-id="${reportId}"]`) as HTMLElement;

  it('shows Before, During and After as sections with the current phase first, marked Now', () => {
    renderPage();

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map(heading => heading.textContent ?? '');
    expect(headings).toEqual(['During the show', 'After the show', 'Before the show', 'Anytime']);
    // "Now" appears once, on the phase the show is in, and nowhere else.
    expect(screen.getAllByText('Now')).toHaveLength(1);
    const duringSection = screen.getByRole('region', { name: 'During the show' });
    expect(within(duringSection).getByText('Now')).toBeInTheDocument();
  });

  it('puts Check-in Sheet and Score Sheet first within the current phase', () => {
    renderPage();

    const during = screen.getByRole('region', { name: 'During the show' });
    const ids = within(during)
      .getAllByTestId('report-card')
      .map(item => item.getAttribute('data-report-id'));
    expect(ids.slice(0, 2)).toEqual(['check-in-sheet', 'scoresheet']);
  });

  it('still lists the pre-show reports — the order is not a filter', () => {
    renderPage();

    const before = screen.getByRole('region', { name: 'Before the show' });
    expect(within(before).getByText('Show Flyer')).toBeInTheDocument();
    expect(within(before).getByText('Waitlist Report')).toBeInTheDocument();
  });

  it('selects a report from its card and shows which one is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    const select = (id: string) => within(card(id)).getAllByRole('button')[0] as HTMLElement;

    expect(select('check-in-sheet')).toHaveAttribute('aria-pressed', 'true');
    await user.click(select('results-sheet'));

    expect(select('results-sheet')).toHaveAttribute('aria-pressed', 'true');
    expect(select('check-in-sheet')).toHaveAttribute('aria-pressed', 'false');
  });

  it('links a report the Overview also offers, and only those', () => {
    renderPage();

    const link = within(card('check-in-sheet')).getByRole('link', {
      name: 'Also on Overview, per class',
    });
    expect(link).toHaveAttribute('href', '/shows/show-1');
    expect(within(card('show-flyer')).queryByRole('link')).not.toBeInTheDocument();
    // Results offers no report today, so no card claims it does.
    expect(screen.queryByText(/Also on Results/)).not.toBeInTheDocument();
  });

  describe('print status chips', () => {
    /** The page's own rows, fingerprinted the way the page fingerprints them. */
    function checkInEvidence(mutate?: (record: Record<string, unknown>) => void) {
      const descriptor = buildReportPaperworkDescriptor({
        reportId: 'check-in-sheet',
        scope: { kind: 'show', showId: 'show-1' },
        classes: seenRows.classes as never,
        entries: seenRows.entries as never,
      });
      if (!descriptor) throw new Error('fixture has no check-in descriptor');
      const record: Record<string, unknown> = {
        id: 'print-1',
        reportId: 'check-in-sheet',
        coverage: JSON.parse(JSON.stringify(descriptor.coverage)),
        fingerprint: descriptor.fingerprint,
        printedAt: '2026-03-22T17:00:00.000Z',
        printedByName: 'Taylor Secretary',
      };
      mutate?.(record);
      return record;
    }

    it('shows when a report was printed, from the print record', () => {
      const first = renderPage();
      const record = checkInEvidence();
      first.unmount();
      mockPrintState.records = [record];
      renderPage();

      expect(within(card('check-in-sheet')).getByTestId('report-card-status')).toHaveTextContent(
        'Printed Mar 22'
      );
      // A fingerprinted report nobody has printed says so; one with no print record says nothing.
      expect(within(card('scoresheet')).getByTestId('report-card-status')).toHaveTextContent(
        'Not printed'
      );
      expect(
        within(card('show-flyer')).queryByTestId('report-card-status')
      ).not.toBeInTheDocument();
    });

    it('says the rows changed after the print when the fingerprint no longer matches', () => {
      const first = renderPage();
      const record = checkInEvidence(r => {
        const coverage = r.coverage as { subjectFingerprints: Record<string, string> };
        for (const key of Object.keys(coverage.subjectFingerprints)) {
          coverage.subjectFingerprints[key] = 'fnv1a64:0000000000000000';
        }
      });
      first.unmount();
      mockPrintState.records = [record];
      renderPage();

      expect(within(card('check-in-sheet')).getByTestId('report-card-status')).toHaveTextContent(
        'Changed since printed'
      );
    });

    it('shows no status while the rows are not settled', () => {
      mockReportState.dataState = 'stale';
      renderPage();

      expect(screen.queryAllByTestId('report-card-status')).toHaveLength(0);
    });

    it('shows no status when the print record could not be read', () => {
      mockPrintState.syncFailed = true;
      renderPage();

      expect(screen.queryAllByTestId('report-card-status')).toHaveLength(0);
    });
  });
});
