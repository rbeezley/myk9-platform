import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import ReportsPage, { resolveInitialReportId, resolveInitialReportScope } from '../index';

const mockReportState = vi.hoisted(() => ({
  trialOneRegistryId: 'AKC',
  isLoading: false,
  /** Overrides the derived state so the paused/stale paths are reachable. */
  dataState: null as null | 'loading' | 'unavailable' | 'stale' | 'error' | 'ready',
}));

const mockPrintState = vi.hoisted(() => ({
  records: [] as Array<Record<string, unknown>>,
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

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: { id: 'show-1', name: 'Spring Scent Trial 2026' },
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
  }),
}));

vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({
    data: mockPrintState.records,
    isError: false,
    syncFailed: false,
  }),
}));

vi.mock('../ReportPreview', () => ({
  ReportPreview: (props: { trialId: string; classId: string }) => (
    <div data-testid="report-preview" data-trial-id={props.trialId} data-class-id={props.classId}>
      Preview
    </div>
  ),
}));

describe('ReportsPage', () => {
  beforeEach(() => {
    mockReportState.trialOneRegistryId = 'AKC';
    mockReportState.isLoading = false;
    mockReportState.dataState = null;
    mockPrintState.records = [];
    toastSpy.called.mockClear();
  });

  it('renders "Reports" title', () => {
    render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('renders while report classes and entries are still loading', () => {
    mockReportState.isLoading = true;

    render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });

    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
  });

  it('renders Print button', () => {
    render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('shows existing print actor and timestamp with the shared stale vocabulary', () => {
    mockPrintState.records = [
      {
        id: 'print-1',
        reportId: 'check-in-sheet',
        coverage: {
          scopeKind: 'show',
          scope: { kind: 'show', showId: '' },
          subjectFingerprints: { 'entry:entry-1': 'different-print' },
          subjectScopes: {
            'entry:entry-1': { classIds: ['class-1'], trialIds: ['trial-1'] },
          },
        },
        fingerprint: 'different-report',
        printedAt: '2026-08-25T12:34:56.000Z',
        printedByName: 'Jannie Secretary',
      },
    ];

    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=check-in-sheet',
    });

    const status = screen.getByTestId('report-print-status');
    expect(status).toHaveTextContent('Stale');
    expect(status).toHaveTextContent('Printed by Jannie Secretary');
    expect(status).toHaveTextContent('2026');
    expect(status).not.toHaveTextContent(/superseded|unconfirmed/i);
  });

  it('keeps emergency packet preparation in Show Desk tools', () => {
    render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });

    expect(screen.queryByRole('heading', { name: 'Emergency Trial Packet' })).toBeNull();
    expect(screen.getByRole('link', { name: /open it in show desk tools/i })).toHaveAttribute(
      'href',
      '/shows/show-1/show-desk?tool=emergency-trial-packet'
    );
  });

  it('offers the official AKC entry form PDF when a dog is selected', async () => {
    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=akc-scent-work-entry-form&dogId=dog-1',
    });

    expect(
      await screen.findByRole('button', { name: /Download AKC Entry Form PDF/i })
    ).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Signature');
  });

  it('offers the official AKC entry form packet when all dogs are selected', async () => {
    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=akc-scent-work-entry-form',
    });

    expect(
      await screen.findByRole('button', { name: /Download AKC Entry Form Packet/i })
    ).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Signature');
  });

  it('offers the official AKC score sheet PDF when a class is selected', async () => {
    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=scoresheet&trialId=trial-1&classId=class-1',
    });

    expect(
      await screen.findByRole('button', { name: /Download AKC Score Sheet PDF/i })
    ).toBeEnabled();
  });

  it('does not offer the AKC score sheet PDF for a non-AKC trial', async () => {
    mockReportState.trialOneRegistryId = 'UKC';

    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=scoresheet&trialId=trial-1&classId=class-1',
    });

    await screen.findByRole('button', { name: /print/i });
    expect(screen.queryByRole('button', { name: /Download AKC Score Sheet PDF/i })).toBeNull();
  });

  it('does not offer the AKC score sheet PDF for a selected non-AKC trial before class selection', async () => {
    mockReportState.trialOneRegistryId = 'UKC';

    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=scoresheet&trialId=trial-1',
    });

    await screen.findByRole('button', { name: /print/i });
    expect(screen.queryByRole('button', { name: /Select class for official PDF/i })).toBeNull();
  });

  it('does not offer AKC official PDFs for AKC-specific trial reports on a non-AKC trial', async () => {
    mockReportState.trialOneRegistryId = 'UKC';

    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=akc-judge-report&trialId=trial-1',
    });

    await screen.findByRole('button', { name: /print/i });
    expect(screen.queryByRole('button', { name: /Download AKC Judge PDF/i })).toBeNull();
  });

  it('does not offer the AKC trial chairman PDF for a non-AKC trial', async () => {
    mockReportState.trialOneRegistryId = 'UKC';

    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=trial-chairman-report&trialId=trial-1',
    });

    await screen.findByRole('button', { name: /print/i });
    expect(screen.queryByRole('button', { name: /Download AKC Trial Chairman PDF/i })).toBeNull();
  });

  it('does not offer AKC entry or certification PDFs for a selected non-AKC trial', async () => {
    mockReportState.trialOneRegistryId = 'UKC';

    const { unmount } = render(<ReportsPage />, {
      initialRoute:
        '/shows/show-1/reports?report=akc-scent-work-entry-form&trialId=trial-1&dogId=dog-1',
    });

    await screen.findByRole('button', { name: /print/i });
    expect(screen.queryByRole('button', { name: /Download AKC Entry Form PDF/i })).toBeNull();

    unmount();
    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=judges-certification&trialId=trial-1',
    });

    await screen.findByRole('button', { name: /print/i });
    expect(
      screen.queryByRole('button', { name: /Download AKC Certification Page PDF/i })
    ).toBeNull();
  });

  it('offers the official UKC entry form PDF when a UKC trial and dog are selected', async () => {
    mockReportState.trialOneRegistryId = 'UKC';

    render(<ReportsPage />, {
      initialRoute:
        '/shows/show-1/reports?report=ukc-nosework-entry-form&trialId=trial-1&dogId=dog-1',
    });

    expect(
      await screen.findByRole('button', { name: /Download UKC Entry Form PDF/i })
    ).toBeEnabled();
  });

  it('offers the official UKC change entry PDF when a UKC trial, class, and dog are selected', async () => {
    mockReportState.trialOneRegistryId = 'UKC';

    render(<ReportsPage />, {
      initialRoute:
        '/shows/show-1/reports?report=ukc-nosework-change-entry-form&trialId=trial-1&classId=class-1&dogId=dog-1',
    });

    expect(
      await screen.findByRole('button', { name: /Download UKC Change Entry PDF/i })
    ).toBeEnabled();
  });

  it('offers static UKC packet PDFs only for UKC trials', async () => {
    const staticReports = [
      {
        label: /Download UKC Element Judges Book PDF/i,
        reportId: 'ukc-nosework-judges-book-element',
      },
      {
        label: /Download UKC Handler Discrimination Judges Book PDF/i,
        reportId: 'ukc-nosework-judges-book-handler-discrimination',
      },
      {
        label: /Download UKC Trial Score Sheet PDF/i,
        reportId: 'ukc-nosework-trial-score-sheet',
      },
    ] as const;

    mockReportState.trialOneRegistryId = 'UKC';

    for (const staticReport of staticReports) {
      const { unmount } = render(<ReportsPage />, {
        initialRoute: `/shows/show-1/reports?report=${staticReport.reportId}&trialId=trial-1`,
      });

      expect(await screen.findByRole('button', { name: staticReport.label })).toBeEnabled();
      unmount();
    }

    mockReportState.trialOneRegistryId = 'AKC';

    for (const staticReport of staticReports) {
      const { unmount } = render(<ReportsPage />, {
        initialRoute: `/shows/show-1/reports?report=${staticReport.reportId}&trialId=trial-1`,
      });

      // Print is hidden for download-only registry forms, so it cannot be
      // the settle point here. The preview always mounts.
      await screen.findByTestId('report-preview');
      expect(screen.queryByRole('button', { name: staticReport.label })).toBeNull();
      unmount();
    }
  });

  it('offers ASCA packet PDFs only for ASCA trials', async () => {
    const ascaReports = [
      {
        label: /Download ASCA Entry Form PDF/i,
        reportId: 'asca-scent-detection-entry-form',
      },
      {
        label: /Download ASCA Trial Report PDF/i,
        reportId: 'asca-scent-detection-trial-report',
      },
      {
        label: /Download ASCA Trial Roster PDF/i,
        reportId: 'asca-scent-detection-trial-roster',
      },
      {
        label: /Download ASCA Score Sheet PDF/i,
        reportId: 'asca-scent-detection-score-sheet',
      },
      {
        label: /Download ASCA Gross Receipts PDF/i,
        reportId: 'asca-scent-detection-gross-receipts',
      },
      {
        label: /Download ASCA Post-Event Evaluation PDF/i,
        reportId: 'asca-scent-detection-post-event-evaluation',
      },
    ] as const;

    mockReportState.trialOneRegistryId = 'ASCA';

    for (const ascaReport of ascaReports) {
      const { unmount } = render(<ReportsPage />, {
        initialRoute: `/shows/show-1/reports?report=${ascaReport.reportId}&trialId=trial-1`,
      });

      expect(await screen.findByRole('button', { name: ascaReport.label })).toBeEnabled();
      unmount();
    }

    mockReportState.trialOneRegistryId = 'AKC';

    for (const ascaReport of ascaReports) {
      const { unmount } = render(<ReportsPage />, {
        initialRoute: `/shows/show-1/reports?report=${ascaReport.reportId}&trialId=trial-1`,
      });

      // Print is hidden for download-only registry forms, so it cannot be
      // the settle point here. The preview always mounts.
      await screen.findByTestId('report-preview');
      expect(screen.queryByRole('button', { name: ascaReport.label })).toBeNull();
      unmount();
    }
  });

  it('offers the official AKC certification page PDF when a trial is selected', async () => {
    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=judges-certification&trialId=trial-1',
    });

    expect(
      await screen.findByRole('button', { name: /Download AKC Certification Page PDF/i })
    ).toBeEnabled();
  });

  it('offers the official AKC transfer form PDF when a dog and class are selected', async () => {
    render(<ReportsPage />, {
      initialRoute:
        '/shows/show-1/reports?report=akc-scent-work-transfer-form&trialId=trial-1&classId=class-1&dogId=dog-1',
    });

    expect(
      await screen.findByRole('button', { name: /Download AKC Transfer Form PDF/i })
    ).toBeEnabled();
  });

  it('resets stale class scope when the trial changes', async () => {
    const user = userEvent.setup();

    render(<ReportsPage />, {
      initialRoute: '/shows/show-1/reports?report=result-catalog&trialId=trial-1&classId=class-1',
    });

    expect(screen.getByTestId('report-preview')).toHaveAttribute('data-class-id', 'class-1');

    const trialSelect = screen.getByRole('combobox', { name: /^trial$/i });
    await user.click(trialSelect);
    await user.click(await screen.findByRole('option', { name: /Trial 2/ }));

    await waitFor(() =>
      expect(screen.getByTestId('report-preview')).toHaveAttribute('data-trial-id', 'trial-2')
    );
    expect(screen.getByTestId('report-preview')).toHaveAttribute('data-class-id', 'all');
    // 30s timeout: this is a real behavioral test (not a perf budget) that is
    // userEvent-heavy and slow under full-suite/CI load — the default 10s trips
    // on a loaded runner even though it passes comfortably in isolation.
  }, 30000);
});

describe('resolveInitialReportId', () => {
  it('returns the default report when no query param is provided', () => {
    expect(resolveInitialReportId(null)).toBe('check-in-sheet');
  });

  it('returns the default report when query param is empty', () => {
    expect(resolveInitialReportId('')).toBe('check-in-sheet');
  });

  it('returns the requested report when it exists and is enabled', () => {
    expect(resolveInitialReportId('judge-supply-checklist')).toBe('judge-supply-checklist');
  });

  it('accepts a result catalog deep link for judge signature routing', () => {
    expect(resolveInitialReportId('result-catalog')).toBe('result-catalog');
  });

  it('falls back to default when the report id is unknown', () => {
    expect(resolveInitialReportId('not-a-real-report')).toBe('check-in-sheet');
  });
});

describe('resolveInitialReportScope', () => {
  it('uses all scopes when no query params are provided', () => {
    expect(resolveInitialReportScope(new URLSearchParams())).toEqual({
      trialId: 'all',
      classId: 'all',
      dogId: 'all',
    });
  });

  it('keeps trial, class, and dog deep-link params', () => {
    const params = new URLSearchParams({
      trialId: 'trial-1',
      classId: 'class-1',
      dogId: 'dog-1',
    });

    expect(resolveInitialReportScope(params)).toEqual({
      trialId: 'trial-1',
      classId: 'class-1',
      dogId: 'dog-1',
    });
  });

  describe('data that is not current', () => {
    // Each of these fails against the pre-fix page, where the official-PDF gate
    // was `isLoading || isError || ...` and Print only checked the iframe.
    it('does not offer a registry PDF download when the entries could not be fetched', async () => {
      mockReportState.dataState = 'unavailable';

      render(<ReportsPage />, {
        initialRoute: '/shows/show-1/reports?report=trial-secretary-report&trialId=trial-1',
      });

      const download = await screen.findByRole('button', { name: /Download .*PDF/i });
      expect(download).toBeDisabled();
    });

    it('does not offer a registry PDF download while the newly picked trial is still loading', async () => {
      mockReportState.dataState = 'stale';

      render(<ReportsPage />, {
        initialRoute: '/shows/show-1/reports?report=trial-secretary-report&trialId=trial-1',
      });

      const download = await screen.findByRole('button', { name: /Download .*PDF/i });
      expect(download).toBeDisabled();
    });

    it('refuses to print, and says why, when there is no connection', async () => {
      mockReportState.dataState = 'unavailable';
      const user = userEvent.setup();

      render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });

      await user.click(screen.getByRole('button', { name: /^print$/i }));

      expect(toastSpy.called).toHaveBeenCalledWith(
        expect.stringMatching(/No connection, so the entries could not be checked/i)
      );
    });

    it('names the trial that is still loading rather than blaming the report', async () => {
      mockReportState.dataState = 'stale';
      const user = userEvent.setup();

      render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });

      await user.click(screen.getByRole('button', { name: /^print$/i }));

      expect(toastSpy.called).toHaveBeenCalledWith(
        expect.stringMatching(/Still loading the trial you just picked/i)
      );
    });
  });

  describe('download-only registry forms', () => {
    it('hides Print, because there is no HTML page to send to a printer', async () => {
      render(<ReportsPage />, {
        initialRoute:
          '/shows/show-1/reports?report=asca-scent-detection-trial-roster&trialId=trial-1',
      });

      await screen.findByTestId('report-preview');

      expect(screen.queryByRole('button', { name: /^print$/i })).toBeNull();
    });
  });

  describe('a disabled download says why in a sentence', () => {
    it('keeps the action on the button and puts the requirement beside it', async () => {
      render(<ReportsPage />, {
        initialRoute: '/shows/show-1/reports?report=trial-secretary-report',
      });

      // Pre-fix this button was LABELLED "Select trial for official PDF" -- an
      // instruction printed on a control that cannot be pressed.
      const download = await screen.findByRole('button', {
        name: /Download AKC Trial Secretary PDF/i,
      });
      expect(download).toBeDisabled();
      expect(screen.getByText(/Pick a trial above to enable this/i)).toBeInTheDocument();
    });
  });
});
