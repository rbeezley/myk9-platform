import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ResultsSubmissionPage from '../ResultsSubmissionPage';

// ---------------------------------------------------------------------------
// Hoisted mock state — lets individual tests flip history data
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

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    selectedShowId: 'show-1',
    shows: [
      { id: 'show-1', name: 'Spring Scent Trial' },
      { id: 'show-2', name: 'Fall Classic' },
    ],
    selectShow: vi.fn(),
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
        formatXml: () => '<?xml version="1.0"?><AKCResults><!-- schema pending --></AKCResults>',
      },
    ],
  };
});

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResultsSubmissionPage', () => {
  beforeEach(() => {
    mockHistoryData.rows = [];
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

  it('renders the XML preview area', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('xml-preview')).toBeInTheDocument());
  });

  it('XML preview contains generated XML when show and formatter are selected', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => {
      const preview = screen.getByTestId('xml-preview') as HTMLTextAreaElement;
      expect(preview.value).toContain('<?xml');
    });
  });

  it('renders the Download XML button', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('download-btn')).toBeInTheDocument());
  });

  it('renders the Mark as Submitted button', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('mark-submitted-btn')).toBeInTheDocument());
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

  it('renders status badge for each submission row', async () => {
    mockHistoryData.rows = [
      {
        id: 'sub-2',
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
    await waitFor(() => expect(screen.getByText('sent')).toBeInTheDocument());
  });
});
