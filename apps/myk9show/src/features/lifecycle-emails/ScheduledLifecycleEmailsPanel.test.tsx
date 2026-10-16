import { onlineManager } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient } from '@/lib/queryClient';
import { render, screen } from '@/test/utils/testUtils';
import {
  fetchLifecycleEmailJobsForReview,
  fetchShowLifecycleEmailSummary,
  sendLifecycleEmailJobs,
  skipLifecycleEmailJobsForReview,
  updateLifecycleEmailStepEnabled,
} from './api';
import { LifecycleSendPartialError } from './api';
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
    mockSendJobs.mockResolvedValue({ sent: 1, failed: 0, total: 1 });
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

  it('offers the registration number needed step beside the decision steps and toggles it', async () => {
    const current = await mockFetchSummary({ supabase: {} as never, showId: 'show-1' });
    mockFetchSummary.mockResolvedValue({
      ...current,
      steps: [
        ...current.steps,
        {
          stepType: 'registration_number_needed',
          isEnabled: true,
          readyCount: 2,
          sentCount: 1,
          failedCount: 1,
          skippedCount: 0,
          dismissedCount: 0,
          warningCount: 0,
        },
      ],
    });
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    expect(await screen.findByText('Registration number needed')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    // Send-on-demand: the other steps (accepted: ready + failed jobs) offer Review, this one
    // never does, even with ready and failed jobs of its own.
    expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(1);

    await user.click(screen.getByRole('switch', { name: /registration number needed enabled/i }));

    await waitFor(() => {
      expect(mockUpdateStep).toHaveBeenCalledWith(
        expect.objectContaining({
          showId: 'show-1',
          stepType: 'registration_number_needed',
          isEnabled: false,
        })
      );
    });
  });

  it('keeps producer-backed review available for accepted entries', async () => {
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'Review' }));

    const review = await screen.findByRole('dialog');
    expect(review).toHaveTextContent('Accepted entries review');
    // Work, not a decision (INTENT: Dialog or Slide-Out): rendered by SlideOverPanel.
    expect(review.querySelector('.slide-over-panel')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
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

  it('shows a partial-send count beside Send and refreshes the review list', async () => {
    mockSendJobs.mockRejectedValue(new LifecycleSendPartialError(200, 2300));
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    const fetchesBefore = mockFetchJobs.mock.calls.length;
    const send = screen.getByRole('button', { name: 'Send now' });
    await user.click(send);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Sent 200 of 2300 emails; the rest are still waiting. Send again to finish.'
    );
    // Same footer container as Send, so it is visible without scrolling the list.
    expect(alert.parentElement).toBe(send.parentElement?.parentElement);
    // onError invalidates the review query: the list is fetched again after the failure.
    await waitFor(() => expect(mockFetchJobs.mock.calls.length).toBeGreaterThan(fetchesBefore));
    expect(send).toHaveTextContent('Send now');
  });

  it('does not close as a success when some recipients failed inside a 200', async () => {
    mockSendJobs.mockResolvedValue({ sent: 95, failed: 5, total: 100 });
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    const fetchesBefore = mockFetchJobs.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Send now' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "Sent 95 of 100 emails. 5 couldn't be sent and are still on the list. Send again to retry them."
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(mockFetchJobs.mock.calls.length).toBeGreaterThan(fetchesBefore));
  });

  it('names a single unsent email in the singular', async () => {
    mockSendJobs.mockResolvedValue({ sent: 0, failed: 1, total: 1 });
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Send now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Sent 0 of 1 email. 1 couldn't be sent and is still on the list. Send again to retry it."
    );
  });

  it('keeps the plural total when one of many fails', async () => {
    mockSendJobs.mockResolvedValue({ sent: 99, failed: 1, total: 100 });
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Send now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Sent 99 of 100 emails. 1 couldn't be sent and is still on the list. Send again to retry it."
    );
  });

  it('closes after an all-success send', async () => {
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Send now' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not retry a failed send automatically', async () => {
    mockSendJobs.mockRejectedValue(new Error('boom'));
    // The app's real defaults retry a mutation once after 1s; the shared test client does not.
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />, {
      queryClient: createAppQueryClient(),
    });
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Send now' }));
    await screen.findByRole('alert', undefined, { timeout: 4000 });
    await new Promise(resolve => setTimeout(resolve, 1500));
    expect(mockSendJobs).toHaveBeenCalledTimes(1);
  });

  it('never traps the secretary offline: the send fails fast and Close works', async () => {
    // The app's real defaults park an online-only mutation while offline: Send would sit on
    // "Sending..." and then fire on its own when the network returns (MYK9-1191 review).
    mockSendJobs.mockRejectedValue(new Error('Failed to fetch'));
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />, {
      queryClient: createAppQueryClient(),
    });
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    await screen.findByRole('button', { name: 'Send now' });
    onlineManager.setOnline(false);
    try {
      await user.click(screen.getByRole('button', { name: 'Send now' }));
      expect(await screen.findByRole('alert', undefined, { timeout: 4000 })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('lets the secretary close mid-send, and a reopened panel still shows the send in flight', async () => {
    let finish: (error: Error) => void = () => {};
    mockSendJobs.mockReturnValue(
      new Promise((_resolve, reject) => {
        finish = reject;
      })
    );
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Send now' }));
    await screen.findByRole('button', { name: 'Sending...' });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    expect(await screen.findByRole('button', { name: 'Sending...' })).toBeDisabled();
    expect(mockSendJobs).toHaveBeenCalledTimes(1);

    finish(new Error('boom'));
    expect(await screen.findByRole('button', { name: 'Send now' })).toBeEnabled();
  });

  it('a send that outlives its panel never closes or clears a panel opened later', async () => {
    let finish: (result: { sent: number; failed: number; total: number }) => void = () => {};
    mockSendJobs.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Send now' }));
    await screen.findByRole('button', { name: 'Sending...' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    const subject = await screen.findByLabelText('Subject');
    await user.type(subject, '!');
    expect(subject).toHaveValue('Entry accepted!');

    const fetchesBefore = mockFetchSummary.mock.calls.length;
    finish({ sent: 1, failed: 0, total: 1 });
    // The old send's refresh still runs (summary is fetched again) ...
    await waitFor(() => expect(mockFetchSummary.mock.calls.length).toBeGreaterThan(fetchesBefore));
    // ... but the panel the secretary is editing now stays open with its edit intact.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toHaveValue('Entry accepted!');
  });

  it('shows one calm sentence, never raw error text, for any other send failure', async () => {
    mockSendJobs.mockRejectedValue(new Error('Edge Function returned a non-2xx status code'));
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Send now' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't send these emails. Nothing was lost; try again.");
    expect(alert).not.toHaveTextContent('non-2xx');
  });

  it('closes the review slide-out on Escape and returns focus to the Review button', async () => {
    const { user } = render(<ScheduledLifecycleEmailsPanel showId="show-1" />);
    const reviewButton = await screen.findByRole('button', { name: 'Review' });
    await user.click(reviewButton);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toHaveFocus());
  });
});
