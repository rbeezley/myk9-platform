import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { calendarDateInTimeZone } from '@/utils/calendarDate';
import ReportsPage from '../index';

const mockReportState = vi.hoisted(() => ({
  trialOneRegistryId: 'AKC',
  isLoading: false,
  /** Overrides the derived state so the paused/stale paths are reachable. */
  dataState: null as null | 'loading' | 'unavailable' | 'stale' | 'error' | 'ready',
}));

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
/** A show that is RUNNING today in its own configured timezone. */
const TODAY_KEY = calendarDateInTimeZone(new Date(), SHOW_TIMEZONE);

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: {
      id: 'show-1',
      name: 'Spring Scent Trial 2026',
      startDate: TODAY_KEY,
      endDate: TODAY_KEY,
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
  ReportPreview: (props: { trialId: string; classId: string }) => (
    <div data-testid="report-preview" data-trial-id={props.trialId} data-class-id={props.classId}>
      Preview
    </div>
  ),
}));

describe('ReportsPage wires the show’s own phase into the report picker', () => {
  /**
   * REV-2341 R-4. The ordering function and the control bar were both well
   * pinned; the HOP between them was not. `grep -rn showPhase src` returned one
   * production occurrence, and forcing it to `'unknown'` left every ReportsPage
   * test green — the classic last-hop drop. This file renders the real page on a
   * show that is running today and reads the order off the DOM.
   */
  beforeEach(() => {
    mockReportState.trialOneRegistryId = 'AKC';
    mockReportState.isLoading = false;
    mockReportState.dataState = null;
    mockPrintState.records = [];
    mockPrintState.isLoading = false;
    mockPrintState.isError = false;
    mockPrintState.syncFailed = false;
    toastSpy.called.mockClear();
  });

  it('puts "During the show" first, and Check-in Sheet first within it', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });

    await user.click(screen.getByRole('combobox', { name: /report/i }));
    // Wait for the listbox to mount before reading order off it. Under load the
    // click resolves before the options render, and a synchronous read then
    // fails on an empty popover rather than on the order.
    await screen.findByText('During the show');

    const headings = ['Before the show', 'During the show', 'After the show', 'Anytime'].map(
      label => screen.getByText(label)
    );
    const firstHeading = [...headings].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    )[0];
    expect(firstHeading).toHaveTextContent('During the show');

    const options = screen.getAllByRole('option').map(option => option.textContent ?? '');
    expect(options[0]).toContain('Check-in Sheet');
    expect(options[1]).toContain('Score Sheet');
  });

  it('still lists the pre-show reports — the order is not a filter', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });

    await user.click(screen.getByRole('combobox', { name: /report/i }));
    await screen.findByText('Before the show');

    const options = screen.getAllByRole('option').map(option => option.textContent ?? '');
    expect(options.some(name => name.includes('Show Flyer'))).toBe(true);
    expect(options.some(name => name.includes('Waitlist Report'))).toBe(true);
  });
});
