// apps/myk9show/src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ResultsSubmissionPage from '../ResultsSubmissionPage';

// ---------------------------------------------------------------------------
// Hoisted mock state
// ---------------------------------------------------------------------------

const mockHistoryData = vi.hoisted(() => ({
  rows: [] as {
    id: string;
    show_id: string;
    trial_id: string | null;
    organization: string;
    sport_type: string;
    submitted_at: string;
    submitted_by: string | null;
    xml_payload: string | null;
    status: 'pending' | 'sent' | 'failed';
  }[],
}));

const mockAKCData = vi.hoisted(() => ({
  data: null as import('@myk9/secretary').AKCSubmissionData | null,
  isLoading: false,
  isError: false,
  isSuccess: true,
}));

const mockShowStoreState = vi.hoisted(() => {
  const state = {
    selectedShowId: 'show-1',
    shows: [
      { id: 'show-1', name: 'Spring Scent Trial' },
      { id: 'show-2', name: 'Fall Classic' },
    ],
    selectShow: vi.fn((showId: string) => {
      state.selectedShowId = showId;
    }),
  };
  return state;
});
const mockSelectShow = mockShowStoreState.selectShow;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    selectedShowId: mockShowStoreState.selectedShowId,
    shows: mockShowStoreState.shows,
    selectShow: mockShowStoreState.selectShow,
  }),
}));

vi.mock('@myk9/secretary', async () => {
  const actual = await vi.importActual<typeof import('@myk9/secretary')>('@myk9/secretary');
  return {
    ...actual,
    listFormatters: () => [
      {
        organization: 'AKC',
        sportType: 'scent_work',
        submissionEmail: 'results@akc.org',
        formatXml: () => '<?xml version="1.0"?><sender xmlns="http://www.akc.org"></sender>',
      },
    ],
    AKCScentWorkFormatter: {
      organization: 'AKC',
      sportType: 'scent_work',
      submissionEmail: 'results@akc.org',
      formatXml: () => '<?xml version="1.0"?><sender xmlns="http://www.akc.org"></sender>',
    },
  };
});

vi.mock('@/hooks/queries/useAKCSubmissionData', () => ({
  useAKCSubmissionData: () => mockAKCData,
}));

vi.mock('@/hooks/mutations/useResultSubmission', () => ({
  useResultSubmission: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useResultSubmissions: () => ({
    data: mockHistoryData.rows,
    isLoading: false,
  }),
}));

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: mockInvoke,
    },
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResultsSubmissionPage', () => {
  beforeEach(() => {
    mockHistoryData.rows = [];
    mockAKCData.data = null;
    mockAKCData.isLoading = false;
    mockAKCData.isError = false;
    mockAKCData.isSuccess = true;
    mockShowStoreState.selectedShowId = 'show-1';
    mockShowStoreState.shows = [
      { id: 'show-1', name: 'Spring Scent Trial' },
      { id: 'show-2', name: 'Fall Classic' },
    ];
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    vi.clearAllMocks();
  });

  it('renders the page heading', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByText('Results Submission')).toBeInTheDocument());
  });

  it('renders the show selector', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('show-selector')).toBeInTheDocument());
  });

  it('renders the organization selector', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('org-selector')).toBeInTheDocument());
  });

  it('selects the route show when ?showId exists', async () => {
    render(<ResultsSubmissionPage />, {
      initialRoute: '/secretary/results-submission?showId=show-2',
    });

    await waitFor(() => expect(mockSelectShow).toHaveBeenCalledWith('show-2'));
  });

  it('applies the route show once without overriding later show changes', async () => {
    const { rerender } = render(<ResultsSubmissionPage />, {
      initialRoute: '/secretary/results-submission?showId=show-2',
    });

    await waitFor(() => expect(mockSelectShow).toHaveBeenCalledWith('show-2'));
    expect(mockShowStoreState.selectedShowId).toBe('show-2');

    mockSelectShow.mockClear();
    mockShowStoreState.selectedShowId = 'show-1';
    rerender(<ResultsSubmissionPage />);

    await waitFor(() => expect(screen.getByText('Spring Scent Trial')).toBeInTheDocument());
    expect(mockSelectShow).not.toHaveBeenCalledWith('show-2');
  });

  it('keeps the selected show when ?showId is invalid', async () => {
    mockShowStoreState.selectedShowId = 'show-2';

    render(<ResultsSubmissionPage />, {
      initialRoute: '/secretary/results-submission?showId=missing-show',
    });

    await waitFor(() => expect(screen.getByText('Fall Classic')).toBeInTheDocument());
    expect(mockSelectShow).not.toHaveBeenCalledWith('missing-show');
    expect(mockSelectShow).not.toHaveBeenCalledWith('show-1');
  });

  it('renders the XML preview area', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('xml-preview')).toBeInTheDocument());
  });

  it('renders the Download XML button', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('download-btn')).toBeInTheDocument());
  });

  it('renders the Send to AKC button', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('send-btn')).toBeInTheDocument());
  });

  it('shows no pre-flight warning when no entries are missing AKC numbers', async () => {
    mockAKCData.data = {
      show: {
        id: 'show-1',
        name: 'T',
        clubName: null,
        date: null,
        clubLicenseNumber: null,
        secretaryName: 'Jane',
        secretaryEmail: 'jane@example.com',
      },
      trials: [],
      entries: [
        {
          dogName: 'Fluffy',
          breed: 'X',
          registrationNumber: 'HP123',
          handlerName: '',
          className: 'N',
          element: 'Container',
          level: 'Novice',
          section: 'A',
          resultCode: null,
          searchTimeSeconds: null,
          totalFaults: null,
          finalPlacement: null,
          armbandNumber: 101,
          trialId: 't1',
          classId: 'c1',
          dogRegisteredName: null,
          dogGender: 'B',
          ownerName: null,
          ownerAddress: null,
          timeLimitSeconds: null,
          entryStatus: 'accepted',
          checkInStatus: 'present',
          resultStatus: null,
        },
      ],
    } as import('@myk9/secretary').AKCSubmissionData;

    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.queryByTestId('preflight-warning')).not.toBeInTheDocument());
  });

  it('shows pre-flight warning when entries are missing AKC registration numbers', async () => {
    mockAKCData.data = {
      show: {
        id: 'show-1',
        name: 'T',
        clubName: null,
        date: null,
        clubLicenseNumber: null,
        secretaryName: 'Jane',
        secretaryEmail: 'jane@example.com',
      },
      trials: [],
      entries: [
        {
          dogName: 'Fluffy',
          breed: 'X',
          registrationNumber: null,
          handlerName: '',
          className: 'N',
          element: 'Container',
          level: 'Novice',
          section: 'A',
          resultCode: null,
          searchTimeSeconds: null,
          totalFaults: null,
          finalPlacement: null,
          armbandNumber: 101,
          trialId: 't1',
          classId: 'c1',
          dogRegisteredName: null,
          dogGender: 'B',
          ownerName: null,
          ownerAddress: null,
          timeLimitSeconds: null,
          entryStatus: 'accepted',
          checkInStatus: 'present',
          resultStatus: null,
        },
      ],
    } as import('@myk9/secretary').AKCSubmissionData;

    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('preflight-warning')).toBeInTheDocument());
    expect(screen.getByTestId('preflight-warning').textContent).toContain('1');
  });

  it('"Send to AKC" calls supabase.functions.invoke with send-results', async () => {
    mockAKCData.data = {
      show: {
        id: 'show-1',
        name: 'Spring',
        clubName: 'Club',
        date: null,
        clubLicenseNumber: null,
        secretaryName: 'Jane',
        secretaryEmail: 'jane@example.com',
      },
      trials: [],
      entries: [],
    } as import('@myk9/secretary').AKCSubmissionData;

    render(<ResultsSubmissionPage />);
    const sendBtn = await screen.findByTestId('send-btn');
    fireEvent.click(sendBtn);

    // Confirm dialog appears first
    const confirmBtn = await screen.findByTestId('send-confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'send-results',
        expect.objectContaining({
          body: expect.objectContaining({
            organization: 'AKC',
            sportType: 'scent_work',
            secretaryEmail: 'jane@example.com',
          }),
        })
      );
    });
  });

  it('shows empty submission history message when no history exists', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() =>
      expect(screen.getByText('No submissions recorded for this show.')).toBeInTheDocument()
    );
  });

  it('renders submission history table when rows exist', async () => {
    mockHistoryData.rows = [
      {
        id: 'sub-1',
        show_id: 'show-1',
        trial_id: null,
        organization: 'AKC',
        sport_type: 'scent_work',
        submitted_at: '2026-05-10T12:00:00Z',
        submitted_by: null,
        xml_payload: null,
        status: 'sent',
      },
    ];

    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('history-table')).toBeInTheDocument());
  });

  it('shows confirmation dialog before sending', async () => {
    mockAKCData.data = {
      show: {
        id: 'show-1',
        name: 'Spring',
        clubName: 'Club',
        date: null,
        clubLicenseNumber: null,
        secretaryName: 'Jane',
        secretaryEmail: 'jane@example.com',
      },
      trials: [],
      entries: [],
    } as import('@myk9/secretary').AKCSubmissionData;

    render(<ResultsSubmissionPage />);
    const sendBtn = await screen.findByTestId('send-btn');
    fireEvent.click(sendBtn);

    // Dialog appears — invoke NOT called yet
    expect(await screen.findByTestId('send-confirm-dialog')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('sends only after confirmation', async () => {
    mockAKCData.data = {
      show: {
        id: 'show-1',
        name: 'Spring',
        clubName: 'Club',
        date: null,
        clubLicenseNumber: null,
        secretaryName: 'Jane',
        secretaryEmail: 'jane@example.com',
      },
      trials: [],
      entries: [],
    } as import('@myk9/secretary').AKCSubmissionData;

    render(<ResultsSubmissionPage />);
    const sendBtn = await screen.findByTestId('send-btn');
    fireEvent.click(sendBtn);

    const confirmBtn = await screen.findByTestId('send-confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('send-results', expect.anything()));
  });
});
