import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import {
  fetchLifecycleEmailJobsForReview,
  fetchShowLifecycleEmailSummary,
  sendLifecycleEmailJobs,
  skipLifecycleEmailJobsForReview,
  updateLifecycleEmailStepEnabled,
} from './api';
import { ScheduledLifecycleEmailsPanel } from './ScheduledLifecycleEmailsPanel';

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

const mockFetchSummary = vi.mocked(fetchShowLifecycleEmailSummary);
const mockFetchJobs = vi.mocked(fetchLifecycleEmailJobsForReview);
const mockSendJobs = vi.mocked(sendLifecycleEmailJobs);
const mockSkipJobs = vi.mocked(skipLifecycleEmailJobsForReview);
const mockUpdateStep = vi.mocked(updateLifecycleEmailStepEnabled);

describe('ScheduledLifecycleEmailsPanel', () => {
  beforeEach(() => {
    mockFetchSummary.mockResolvedValue({
      steps: [
        {
          stepType: 'accepted',
          isEnabled: true,
          readyCount: 3,
          sentCount: 2,
          failedCount: 1,
          skippedCount: 0,
          dismissedCount: 0,
          warningCount: 1,
        },
        {
          stepType: 'waitlisted',
          isEnabled: false,
          readyCount: 0,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          dismissedCount: 0,
          warningCount: 0,
        },
        {
          stepType: 'two_week_reminder',
          isEnabled: true,
          readyCount: 4,
          sentCount: 3,
          failedCount: 0,
          skippedCount: 0,
          dismissedCount: 0,
          warningCount: 0,
        },
        {
          stepType: 'day_before_reminder',
          isEnabled: true,
          readyCount: 2,
          sentCount: 1,
          failedCount: 0,
          skippedCount: 0,
          dismissedCount: 0,
          warningCount: 0,
        },
        {
          stepType: 'results_available',
          isEnabled: true,
          readyCount: 1,
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
        stepType: 'accepted',
        status: 'ready',
        recipientEmail: 'jamie@example.com',
        recipientName: 'Jamie',
        subject: 'Entry accepted',
        body: 'See you soon.',
        secretaryNote: '',
        previewWarnings: [],
      },
    ]);
    mockSendJobs.mockResolvedValue(undefined);
    mockSkipJobs.mockResolvedValue(undefined);
    mockUpdateStep.mockResolvedValue(undefined);
  });

  it('renders producer-backed entry decision steps and hides inert scheduled steps', async () => {
    render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    expect(await screen.findByText('Accepted entries')).toBeInTheDocument();
    expect(screen.getByText('Waitlist entries')).toBeInTheDocument();
    expect(screen.getByText('3 ready · 2 sent · 1 failed · 1 warning')).toBeInTheDocument();
    expect(screen.queryByText('Two-week reminder')).not.toBeInTheDocument();
    expect(screen.queryByText('Day-before reminder')).not.toBeInTheDocument();
    expect(screen.queryByText('Results available')).not.toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  it('only updates a visible producer-backed step', async () => {
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    await user.click(await screen.findByRole('switch', { name: /waitlist entries enabled/i }));

    await waitFor(() => {
      expect(mockUpdateStep).toHaveBeenCalledWith(
        expect.objectContaining({
          showId: 'show-1',
          stepType: 'waitlisted',
          isEnabled: true,
        })
      );
    });
  });

  it('keeps producer-backed review available for accepted entries', async () => {
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'Review' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Accepted entries review');
    expect(mockFetchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1', stepType: 'accepted' })
    );
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
});
