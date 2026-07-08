import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ScheduledLifecycleEmailsPanel } from './ScheduledLifecycleEmailsPanel';
import {
  fetchLifecycleEmailJobsForReview,
  fetchShowLifecycleEmailSummary,
  sendLifecycleEmailJobs,
  updateLifecycleEmailStepEnabled,
} from './api';

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchLifecycleEmailJobsForReview: vi.fn(),
    fetchShowLifecycleEmailSummary: vi.fn(),
    sendLifecycleEmailJobs: vi.fn(),
    updateLifecycleEmailStepEnabled: vi.fn(),
  };
});

const mockFetchJobs = vi.mocked(fetchLifecycleEmailJobsForReview);
const mockFetchSummary = vi.mocked(fetchShowLifecycleEmailSummary);
const mockSendJobs = vi.mocked(sendLifecycleEmailJobs);
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
          subject: 'Two weeks away',
          body: 'See you soon.',
        })
      );
    });
  });
});
