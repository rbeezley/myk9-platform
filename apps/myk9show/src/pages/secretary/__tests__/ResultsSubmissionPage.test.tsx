// apps/myk9show/src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import ResultsSubmissionPage from '../ResultsSubmissionPage';
import {
  makeAKCSubmissionData,
  makeHistoryRow,
  type SubmissionHistoryRow,
} from './ResultsSubmissionPage.test.fixtures';
import type { AKCSubmissionData } from '@myk9/secretary';

// ---------------------------------------------------------------------------
// Hoisted mock state
// ---------------------------------------------------------------------------

const mockHistoryData = vi.hoisted(() => ({
  rows: [] as SubmissionHistoryRow[],
}));

const mockAKCData = vi.hoisted(() => ({
  data: null as AKCSubmissionData | null,
  isLoading: false,
  isError: false,
  isSuccess: true,
}));

const mockShowState = vi.hoisted(() => ({
  organization: 'AKC',
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: (showId: string | undefined) => ({
    show: showId
      ? { id: showId, name: 'Spring Scent Trial', organization: mockShowState.organization }
      : null,
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

const mockMutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/mutations/useResultSubmission', () => ({
  useResultSubmission: () => ({
    mutate: mockMutate,
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
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <Routes>
      <Route path="/shows/:id/*" element={<ResultsSubmissionPage />} />
    </Routes>,
    { initialRoute: '/shows/show-1/submit-results' }
  );
}

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
    mockShowState.organization = 'AKC';
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    vi.clearAllMocks();
  });

  it('renders the page heading matching the nav label ("Submit Results")', async () => {
    renderPage();
    // Heading text must match the nav tab / route / Show Desk card, which all say
    // "Submit Results" — not the old standalone "Results Submission".
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Submit Results' })).toBeInTheDocument()
    );
    expect(screen.queryByText('Results Submission')).not.toBeInTheDocument();
  });

  it('renders the organization selector', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('org-selector')).toBeInTheDocument());
  });

  it('renders the XML preview area', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('xml-preview')).toBeInTheDocument());
  });

  it('renders the Download XML button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('download-btn')).toBeInTheDocument());
  });

  it('renders the Send to AKC button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('send-btn')).toBeInTheDocument());
  });

  it('shows no pre-flight warning when no entries are missing AKC numbers', async () => {
    mockAKCData.data = makeAKCSubmissionData();

    renderPage();
    await waitFor(() => expect(screen.queryByTestId('preflight-warning')).not.toBeInTheDocument());
  });

  it('shows pre-flight warning when entries are missing AKC registration numbers', async () => {
    mockAKCData.data = makeAKCSubmissionData({ entries: [{ registrationNumber: null }] });

    renderPage();
    await waitFor(() => expect(screen.getByTestId('preflight-warning')).toBeInTheDocument());
    const warning = screen.getByTestId('preflight-warning');
    expect(warning.textContent).toContain('1');
    // Theme-aware via semantic token: uses warning token that adapts in dark mode.
    expect(warning.className).toContain('bg-warning/10');
    expect(warning.className).toContain('text-warning');
    expect(warning).toHaveAttribute('role', 'alert');
    expect(warning).not.toHaveTextContent('akcDogRegnum');
    expect(screen.getByTestId('send-disabled-reason')).toHaveTextContent(
      '1 entry needs AKC registration number before sending.'
    );
    expect(screen.getByTestId('download-btn')).toHaveTextContent('Download draft XML');
  });

  it('blocks sending to AKC when entries are missing registration numbers', async () => {
    mockAKCData.data = makeAKCSubmissionData({ entries: [{ registrationNumber: null }] });

    renderPage();

    expect(await screen.findByTestId('preflight-warning')).toBeInTheDocument();
    expect(screen.getByTestId('send-btn')).toBeDisabled();
    fireEvent.click(screen.getByTestId('send-btn'));

    expect(screen.queryByTestId('send-confirm-dialog')).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('"Send to AKC" calls supabase.functions.invoke with send-results', async () => {
    mockAKCData.data = makeAKCSubmissionData({ entries: [] });

    renderPage();
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
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('No submissions recorded for this show.')).toBeInTheDocument()
    );
  });

  it('renders submission history table when rows exist', async () => {
    mockHistoryData.rows = [makeHistoryRow()];

    renderPage();
    await waitFor(() => expect(screen.getByTestId('history-table')).toBeInTheDocument());
  });

  it('presents sent history as an honest emailed badge', async () => {
    mockHistoryData.rows = [makeHistoryRow()];

    renderPage();
    expect(await screen.findByText('Emailed')).toBeInTheDocument();
  });

  it('wraps the history table so it can scroll horizontally on narrow screens', async () => {
    mockHistoryData.rows = [makeHistoryRow()];

    renderPage();
    const table = await screen.findByTestId('history-table');
    expect(table.closest('.overflow-x-auto')).not.toBeNull();
  });

  it('shows confirmation dialog before sending', async () => {
    mockAKCData.data = makeAKCSubmissionData({ entries: [] });

    renderPage();
    const sendBtn = await screen.findByTestId('send-btn');
    fireEvent.click(sendBtn);

    // Dialog appears — invoke NOT called yet
    expect(await screen.findByTestId('send-confirm-dialog')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('sends only after confirmation', async () => {
    mockAKCData.data = makeAKCSubmissionData({ entries: [] });

    renderPage();
    const sendBtn = await screen.findByTestId('send-btn');
    fireEvent.click(sendBtn);

    const confirmBtn = await screen.findByTestId('send-confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('send-results', expect.anything()));
  });

  // "Mark as submitted" records a submission filed elsewhere (the org portal).
  // It must read as distinct from "Send", be guarded against a phantom log on
  // the auto-selected formatter, and persist a distinct `submitted` status.
  describe('Mark as submitted (manual record, distinct from Send)', () => {
    const oneEntry = {
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

    it('contrasts Send vs Mark as submitted in the helper copy', async () => {
      renderPage();
      const help = await screen.findByTestId('action-help');
      expect(help.textContent).toMatch(/emails the file now/i);
      expect(help.textContent).toMatch(/just logs it here/i);
    });

    it('disables Mark as submitted for AKC scent work when no entry data is loaded', async () => {
      mockAKCData.data = null;
      renderPage();
      const markBtn = await screen.findByTestId('mark-submitted-btn');
      expect(markBtn).toBeDisabled();
    });

    it('disables Mark as submitted when AKC scent work has zero entries', async () => {
      mockAKCData.data = {
        ...oneEntry,
        entries: [],
      } as import('@myk9/secretary').AKCSubmissionData;
      renderPage();
      const markBtn = await screen.findByTestId('mark-submitted-btn');
      expect(markBtn).toBeDisabled();
    });

    it('confirms first, then records a distinct `submitted` status (no email)', async () => {
      mockAKCData.data = oneEntry;
      mockMutate.mockImplementationOnce((_input, options) => {
        options?.onSuccess?.();
      });
      renderPage();

      const markBtn = await screen.findByTestId('mark-submitted-btn');
      expect(markBtn).not.toBeDisabled();
      fireEvent.click(markBtn);

      // Confirmation gates the write — nothing recorded yet.
      expect(await screen.findByTestId('mark-confirm-dialog')).toBeInTheDocument();
      expect(mockMutate).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('mark-confirm-btn'));

      await waitFor(() =>
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'submitted' }),
          expect.objectContaining({
            onError: expect.any(Function),
            onSuccess: expect.any(Function),
          })
        )
      );
      // It records, it does not email.
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(screen.getByTestId('mark-success')).toBeInTheDocument();
    });

    it('does not show success when recording the manual submission fails', async () => {
      mockAKCData.data = oneEntry;
      mockMutate.mockImplementationOnce((_input, options) => {
        options?.onError?.(new Error('insert failed'));
      });

      renderPage();

      fireEvent.click(await screen.findByTestId('mark-submitted-btn'));
      fireEvent.click(await screen.findByTestId('mark-confirm-btn'));

      await waitFor(() => expect(mockMutate).toHaveBeenCalled());
      expect(screen.queryByTestId('mark-success')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to record/i);
    });

    it('renders a manual record in history as "Marked submitted"', async () => {
      mockHistoryData.rows = [
        {
          id: 'sub-2',
          show_id: 'show-1',
          trial_id: null,
          organization: 'AKC',
          sport_type: 'scent_work',
          submitted_at: '2026-05-11T12:00:00Z',
          submitted_by: null,
          xml_payload: null,
          status: 'submitted',
        },
      ];
      renderPage();
      await waitFor(() => expect(screen.getByText('Marked submitted')).toBeInTheDocument());
    });

    it('shows UKC as a manual closeout path with reports and official guidance links', async () => {
      mockShowState.organization = 'UKC';

      renderPage();

      const trigger = await screen.findByTestId('org-selector');
      expect(trigger).toHaveTextContent('UKC Nosework');
      expect(screen.queryByTestId('send-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('download-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('xml-details')).not.toBeInTheDocument();
      expect(screen.getByTestId('registry-submission-guidance')).toHaveTextContent(
        'UKC Nosework closeout is a paperwork packet'
      );
      expect(screen.getByRole('link', { name: 'Open Reports' })).toHaveAttribute(
        'href',
        '/shows/show-1/reports?report=trial-secretary-report'
      );
      expect(screen.getByRole('link', { name: /UKC Nosework Forms & Rules/ })).toHaveAttribute(
        'href',
        'https://www.ukcdogs.com/nosework-forms-rules'
      );
    });

    it('shows ASCA as a manual closeout path and hides unsupported XML actions', async () => {
      mockShowState.organization = 'ASCA';

      renderPage();

      const trigger = await screen.findByTestId('org-selector');
      expect(trigger).toHaveTextContent('ASCA Scent Detection');
      expect(screen.queryByTestId('send-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('download-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('xml-details')).not.toBeInTheDocument();
      expect(screen.getByTestId('submission-summary-manual')).toHaveTextContent(
        'ASCA Scent Detection uses ASCA online results/payment upload'
      );
      expect(
        screen.getByRole('link', { name: /ASCA Online Results and Payment Upload/ })
      ).toHaveAttribute('href', 'https://asca.org/online-event-sanctioning/');
    });

    it('records UKC manual submission history without generating XML or emailing', async () => {
      mockShowState.organization = 'UKC';
      mockMutate.mockImplementationOnce((_input, options) => {
        options?.onSuccess?.();
      });

      renderPage();

      const markBtn = await screen.findByTestId('mark-submitted-btn');
      expect(markBtn).not.toBeDisabled();
      fireEvent.click(markBtn);
      fireEvent.click(await screen.findByTestId('mark-confirm-btn'));

      await waitFor(() =>
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            organization: 'UKC',
            sport_type: 'nosework',
            status: 'submitted',
            xml_payload: null,
          }),
          expect.objectContaining({
            onError: expect.any(Function),
            onSuccess: expect.any(Function),
          })
        )
      );
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(screen.getByTestId('mark-success')).toBeInTheDocument();
    });
  });

  // F6a (Lane 1.2 re-walk): the Organization trigger echoed the raw
  // `organization:sportType` value ("AKC:scent_work") instead of a human label.
  describe('Organization selector shows a human label, not the raw id (F6a)', () => {
    it('shows "AKC Scent Work" in the trigger, not "AKC:scent_work"', async () => {
      renderPage();
      const trigger = await screen.findByTestId('org-selector');
      expect(trigger.textContent ?? '').toMatch(/AKC Scent Work/);
      expect(trigger.textContent ?? '').not.toMatch(/AKC:scent_work/);
    });
  });

  // F4-XML (Lane 1.2 re-walk): the page led with the raw generated XML. It now
  // leads with a plain-English readiness checklist and keeps the XML behind a
  // "View electronic-submission details" disclosure.
  describe('Submission summary leads; raw XML is behind a disclosure (F4-XML)', () => {
    const akcDataWithRegNumbers = makeAKCSubmissionData();

    it('renders the human checklist and the disclosure (XML not the lead)', async () => {
      mockAKCData.data = akcDataWithRegNumbers;
      renderPage();

      await waitFor(() => expect(screen.getByTestId('submission-checklist')).toBeInTheDocument());
      const checklist = screen.getByTestId('submission-checklist');
      expect(checklist.textContent).toMatch(/1 entry is ready to send to AKC/);
      expect(checklist.textContent).toMatch(/All entries have AKC registration numbers/);

      // XML lives behind the disclosure rather than leading the page.
      expect(screen.getByTestId('xml-details')).toBeInTheDocument();
      expect(screen.getByText('View electronic-submission details')).toBeInTheDocument();
      expect(screen.queryByText('XML Preview')).not.toBeInTheDocument();
    });

    it('flags missing registration numbers in the checklist', async () => {
      mockAKCData.data = makeAKCSubmissionData({ entries: [{ registrationNumber: null }] });
      renderPage();

      const checklist = await screen.findByTestId('submission-checklist');
      expect(checklist.textContent).toMatch(/1 entry is missing AKC registration numbers/);
      expect(checklist.textContent).toMatch(/Send to AKC stays disabled/);
    });
  });
});
