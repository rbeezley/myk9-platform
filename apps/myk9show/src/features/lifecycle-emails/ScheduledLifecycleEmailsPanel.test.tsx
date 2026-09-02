import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ScheduledLifecycleEmailsPanel } from './ScheduledLifecycleEmailsPanel';
import {
  fetchLifecycleEmailJobsForReview,
  fetchShowLifecycleEmailSummary,
  sendLifecycleEmailJobs,
  skipLifecycleEmailJobsForReview,
  updateLifecycleEmailStepEnabled,
} from './api';

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchLifecycleEmailJobsForReview: vi.fn(),
    fetchShowLifecycleEmailSummary: vi.fn(),
    sendLifecycleEmailJobs: vi.fn(),
    skipLifecycleEmailJobsForReview: vi.fn(),
    updateLifecycleEmailStepEnabled: vi.fn(),
  };
});

const mockFetchJobs = vi.mocked(fetchLifecycleEmailJobsForReview);
const mockFetchSummary = vi.mocked(fetchShowLifecycleEmailSummary);
const mockSendJobs = vi.mocked(sendLifecycleEmailJobs);
const mockSkipJobs = vi.mocked(skipLifecycleEmailJobsForReview);
const mockUpdateStep = vi.mocked(updateLifecycleEmailStepEnabled);

describe('ScheduledLifecycleEmailsPanel', () => {
  beforeEach(() => {
    mockFetchSummary.mockResolvedValue({
      steps: [
        {
          stepType: 'two_week_reminder',
          isEnabled: true,
          readyCount: 3,
          sentCount: 2,
          failedCount: 1,
          skippedCount: 0,
          dismissedCount: 0,
          warningCount: 1,
        },
        {
          stepType: 'day_before_reminder',
          isEnabled: false,
          readyCount: 0,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          dismissedCount: 0,
          warningCount: 0,
        },
      ],
      receipts: {
        sentCount: 0,
        failedCount: 0,
        latestSentAtByRegistrationId: {},
      },
    });
    mockFetchJobs.mockResolvedValue([
      {
        id: 'job-1',
        stepType: 'two_week_reminder',
        status: 'ready',
        recipientEmail: 'jamie@example.com',
        recipientName: 'Jamie',
        subject: 'Two weeks away',
        body: 'See you soon.',
        secretaryNote: '',
        previewWarnings: ['Armband is not assigned yet.'],
      },
    ]);
    mockSendJobs.mockResolvedValue(undefined);
    mockSkipJobs.mockResolvedValue(undefined);
    mockUpdateStep.mockResolvedValue(undefined);
  });

  it('shows scheduled email summary counts and review action', async () => {
    render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    expect(await screen.findByText('Two-week reminder')).toBeInTheDocument();
    expect(screen.getByText('3 ready · 2 sent · 1 failed · 1 warning')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('updates a lifecycle step toggle', async () => {
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    await screen.findByText('Day-before reminder');
    await user.click(screen.getByRole('switch', { name: /day-before reminder enabled/i }));

    await waitFor(() => {
      expect(mockUpdateStep).toHaveBeenCalledWith(
        expect.objectContaining({
          showId: 'show-1',
          stepType: 'day_before_reminder',
          isEnabled: true,
        })
      );
    });
  });

  it('opens batch review lazily and sends selected ready jobs', async () => {
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'Review' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Two-week reminder review');
    expect(mockFetchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1', stepType: 'two_week_reminder' })
    );
    expect(screen.getByText('jamie@example.com')).toBeInTheDocument();
    expect(screen.getByText('Armband is not assigned yet.')).toBeInTheDocument();
    expect(screen.getByText('Preview for Jamie')).toBeInTheDocument();
    expect(screen.getAllByText('See you soon.')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Send now' }));

    await waitFor(() => {
      expect(mockSendJobs).toHaveBeenCalledWith(
        expect.objectContaining({
          showId: 'show-1',
          jobIds: ['job-1'],
          subject: null,
          body: null,
          secretaryNote: null,
        })
      );
    });
  });

  it('shows failed recipients as retryable and includes them in Send now', async () => {
    mockFetchJobs.mockResolvedValueOnce([
      {
        id: 'job-ready',
        stepType: 'two_week_reminder',
        status: 'ready',
        recipientEmail: 'ready@example.com',
        recipientName: 'Ready',
        subject: 'Two weeks away',
        body: 'See you soon.',
        secretaryNote: '',
        previewWarnings: [],
      },
      {
        id: 'job-failed',
        stepType: 'two_week_reminder',
        status: 'failed',
        recipientEmail: 'failed@example.com',
        recipientName: 'Failed',
        subject: 'Two weeks away',
        body: 'See you soon.',
        secretaryNote: '',
        previewWarnings: ['Previous send failed.'],
      },
    ]);
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'Review' }));

    expect(await screen.findByText('1 failed recipient is ready to retry.')).toBeInTheDocument();
    expect(screen.getByText('failed@example.com')).toBeInTheDocument();
    expect(screen.getByText('Previous send failed.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send now' }));

    await waitFor(() => {
      expect(mockSendJobs).toHaveBeenCalledWith(
        expect.objectContaining({
          jobIds: ['job-ready', 'job-failed'],
        })
      );
    });
  });

  it('skips excluded recipients and sends only included recipients', async () => {
    mockFetchJobs.mockResolvedValueOnce([
      {
        id: 'job-ready',
        stepType: 'two_week_reminder',
        status: 'ready',
        recipientEmail: 'ready@example.com',
        recipientName: 'Ready',
        subject: 'Two weeks away',
        body: 'See you soon.',
        secretaryNote: '',
        previewWarnings: [],
      },
      {
        id: 'job-failed',
        stepType: 'two_week_reminder',
        status: 'failed',
        recipientEmail: 'failed@example.com',
        recipientName: 'Failed',
        subject: 'Two weeks away',
        body: 'See you soon.',
        secretaryNote: '',
        previewWarnings: ['Previous send failed.'],
      },
      {
        id: 'job-no-email',
        stepType: 'two_week_reminder',
        status: 'ready',
        recipientEmail: null,
        recipientName: 'Missing Email',
        subject: 'Two weeks away',
        body: 'See you soon.',
        secretaryNote: '',
        previewWarnings: ['No email on file.'],
      },
    ]);
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'Review' }));
    expect(await screen.findByText('No email on file')).toBeInTheDocument();
    await user.click(await screen.findByRole('checkbox', { name: /include failed/i }));
    await user.click(screen.getByRole('button', { name: 'Send now' }));

    await waitFor(() => {
      expect(mockSkipJobs).toHaveBeenCalledWith(
        expect.objectContaining({
          jobIds: ['job-no-email', 'job-failed'],
        })
      );
      expect(mockSendJobs).toHaveBeenCalledWith(
        expect.objectContaining({
          jobIds: ['job-ready'],
        })
      );
    });
  });

  it('opens batch review when a step only has failed retryable jobs', async () => {
    mockFetchSummary.mockResolvedValueOnce({
      steps: [
        {
          stepType: 'two_week_reminder',
          isEnabled: true,
          readyCount: 0,
          sentCount: 0,
          failedCount: 1,
          skippedCount: 0,
          dismissedCount: 0,
          warningCount: 0,
        },
      ],
      receipts: {
        sentCount: 0,
        failedCount: 0,
        latestSentAtByRegistrationId: {},
      },
    });
    mockFetchJobs.mockResolvedValueOnce([
      {
        id: 'job-failed',
        stepType: 'two_week_reminder',
        status: 'failed',
        recipientEmail: 'failed@example.com',
        recipientName: 'Failed',
        subject: 'Two weeks away',
        body: 'See you soon.',
        secretaryNote: '',
        previewWarnings: ['Previous send failed.'],
      },
    ]);
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'Review' }));

    expect(await screen.findByText('1 failed recipient is ready to retry.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send now' }));

    await waitFor(() => {
      expect(mockSendJobs).toHaveBeenCalledWith(
        expect.objectContaining({
          jobIds: ['job-failed'],
        })
      );
    });
  });

  it('sends no override text so each recipient keeps their personalised draft', async () => {
    mockFetchJobs.mockResolvedValueOnce([
      {
        id: 'job-alice',
        stepType: 'two_week_reminder',
        status: 'ready',
        recipientEmail: 'alice@example.com',
        recipientName: 'Alice',
        subject: 'Entry accepted - Rex',
        body: 'Hi Alice, your entry for Rex has been accepted. Armband: 12',
        secretaryNote: '',
        previewWarnings: [],
      },
      {
        id: 'job-bob',
        stepType: 'two_week_reminder',
        status: 'ready',
        recipientEmail: 'bob@example.com',
        recipientName: 'Bob',
        subject: 'Entry accepted - Fido',
        body: 'Hi Bob, your entry for Fido has been accepted. Armband: 47',
        secretaryNote: '',
        previewWarnings: [],
      },
    ]);
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'Review' }));
    expect(
      await screen.findByText('The other recipient gets their own personalised message.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send now' }));

    await waitFor(() => {
      expect(mockSendJobs).toHaveBeenCalledWith(
        expect.objectContaining({
          jobIds: ['job-alice', 'job-bob'],
          subject: null,
          body: null,
          secretaryNote: null,
        })
      );
    });
  });

  it('warns before broadcasting an edited body over every personalised draft', async () => {
    mockFetchJobs.mockResolvedValueOnce([
      {
        id: 'job-alice',
        stepType: 'two_week_reminder',
        status: 'ready',
        recipientEmail: 'alice@example.com',
        recipientName: 'Alice',
        subject: 'Entry accepted - Rex',
        body: 'Hi Alice, your entry for Rex has been accepted.',
        secretaryNote: '',
        previewWarnings: [],
      },
      {
        id: 'job-bob',
        stepType: 'two_week_reminder',
        status: 'ready',
        recipientEmail: 'bob@example.com',
        recipientName: 'Bob',
        subject: 'Entry accepted - Fido',
        body: 'Hi Bob, your entry for Fido has been accepted.',
        secretaryNote: '',
        previewWarnings: [],
      },
    ]);
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByLabelText('Message');
    // One keystroke is enough to flip the edit state; see the CLAUDE.md lesson
    // on userEvent.type cost against controlled inputs.
    await user.type(screen.getByLabelText('Message'), '!');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This text will replace 2 personalised drafts.'
    );

    await user.click(screen.getByRole('button', { name: 'Send now' }));

    await waitFor(() => {
      expect(mockSendJobs).toHaveBeenCalledWith(
        expect.objectContaining({
          jobIds: ['job-alice', 'job-bob'],
          body: 'Hi Alice, your entry for Rex has been accepted.!',
          subject: null,
          secretaryNote: null,
        })
      );
    });
  });
});
