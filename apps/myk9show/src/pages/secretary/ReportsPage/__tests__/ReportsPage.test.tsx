import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import ReportsPage, { resolveInitialReportId, resolveInitialReportScope } from '../index';

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
      { id: 'trial-1', trial_number: 1, event_number: '2026123401', date: '2026-04-12' },
      { id: 'trial-2', trial_number: 2, date: '2026-04-13' },
    ],
    classes: [
      {
        id: 'class-1',
        element: 'Buried',
        level: 'Novice',
        section: '',
        trial_id: 'trial-1',
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
      },
    ],
    entries: [
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
    isLoading: false,
    isError: false,
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
        entries: [],
        agreementDate: '2026-04-01T12:00:00Z',
      },
    ],
    secretary: null,
    trials: [{ id: 'trial-1', date: '2026-04-12', trialNumber: 1 }],
    classes: [],
    show: null,
    isLoading: false,
    isError: false,
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
  it('renders "Reports" title', () => {
    render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('renders Print button', () => {
    render(<ReportsPage />, { initialRoute: '/shows/show-1/reports' });
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
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

  it('resets stale class scope when the trial changes', async () => {
    const user = userEvent.setup();

    render(<ReportsPage />, {
      initialRoute:
        '/shows/show-1/reports?report=result-catalog&trialId=trial-1&classId=class-1',
    });

    expect(screen.getByTestId('report-preview')).toHaveAttribute('data-class-id', 'class-1');

    const trialSelect = screen.getByRole('combobox', { name: /select trial/i });
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
});
