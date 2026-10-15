import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  useRegistrationNumberNeededEmail,
  type RegistrationNumberNeededTarget,
} from './useRegistrationNumberNeededEmail';
import {
  fetchShowLifecycleEmailSummary,
  saveLifecycleEmailJobForLater,
  sendLifecycleEmailJobs,
  skipLifecycleEmailJobsForReview,
} from './api';
import {
  readRegistrationNumberNeededHistory,
  fetchRegistrationNumberNeededJobCounts,
} from './registrationNumberNeeded';
import type { LifecycleEmailScheduledSummary } from './readModel';

interface DialogProps {
  onOpenChange: (open: boolean) => void;
  initialSubject?: string | null;
  entry: { dogName?: string | null; registryName?: string | null };
  notNowLabel: string;
  onNotNow: (values: { subject: string; body: string; secretaryNote: string }) => void;
  onSend: (values: { subject: string; body: string; secretaryNote: string }) => Promise<void>;
}
const dialog = vi.hoisted(() => ({ current: null as DialogProps | null }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./LifecycleEmailPreviewDialog', () => ({
  LifecycleEmailPreviewDialog: (props: DialogProps) => {
    dialog.current = props;
    return <div data-testid="preview" />;
  },
}));
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchShowLifecycleEmailSummary: vi.fn(),
  saveLifecycleEmailJobForLater: vi.fn(),
  sendLifecycleEmailJobs: vi.fn(),
  skipLifecycleEmailJobsForReview: vi.fn(),
}));
vi.mock('./registrationNumberNeeded', async importOriginal => ({
  ...(await importOriginal<typeof import('./registrationNumberNeeded')>()),
  readRegistrationNumberNeededHistory: vi.fn(),
  fetchRegistrationNumberNeededJobCounts: vi.fn(),
}));

const summary = (isEnabled: boolean): LifecycleEmailScheduledSummary => ({
  steps: [
    {
      stepType: 'registration_number_needed',
      isEnabled,
      readyCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      dismissedCount: 0,
      warningCount: 0,
    },
  ],
  receipts: { sentCount: 0, failedCount: 0, latestSentAtByRegistrationId: {} },
});

const target = (id: string, ownerEmail: string): RegistrationNumberNeededTarget => ({
  registryId: 'AKC',
  entry: {
    id,
    showId: 'show-1',
    dogName: `Dog ${id}`,
    ownerName: 'Pat',
    ownerEmail,
    classes: [{ id, name: 'Container Novice' }],
  } as unknown as EntryManagementEntry,
});

type Hook = ReturnType<typeof useRegistrationNumberNeededEmail>;

function mountHook() {
  const api: { current: Hook | null } = { current: null };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const hook = useRegistrationNumberNeededEmail({ showId: 'show-1', showName: 'Show' });
    useEffect(() => {
      api.current = hook;
    });
    return <>{hook.dialog}</>;
  }
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
  return { api, view };
}

const values = { subject: 's', body: 'b', secretaryNote: '' };

async function openFor(api: { current: Hook | null }, t: RegistrationNumberNeededTarget) {
  await waitFor(() => expect(api.current?.stepEnabled).toBe(true));
  act(() => api.current?.openEmail(t));
}

describe('useRegistrationNumberNeededEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialog.current = null;
    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(true));
    vi.mocked(fetchRegistrationNumberNeededJobCounts).mockResolvedValue({});
    vi.mocked(readRegistrationNumberNeededHistory).mockResolvedValue({
      count: 0,
      outstandingJobIds: [],
    });
    vi.mocked(saveLifecycleEmailJobForLater).mockResolvedValue('job-1');
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 1, failed: 0, total: 1 });
    vi.mocked(skipLifecycleEmailJobsForReview).mockResolvedValue(undefined);
  });

  it('is enabled only once the show settings say the step is on', async () => {
    const on = mountHook();
    await waitFor(() => expect(on.api.current?.stepEnabled).toBe(true));
    on.view.unmount();

    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(false));
    const off = mountHook();
    await waitFor(() => expect(fetchShowLifecycleEmailSummary).toHaveBeenCalledTimes(2));
    expect(off.api.current?.stepEnabled).toBe(false);
  });

  it('reads the per-entry job counts in ONE query and flags only entries that have a job', async () => {
    vi.mocked(fetchRegistrationNumberNeededJobCounts).mockResolvedValue({ e1: 2 });
    const { api } = mountHook();
    await waitFor(() => expect(api.current?.hasEmailed('e1')).toBe(true));

    expect(api.current?.hasEmailed('e2')).toBe(false);
    expect(fetchRegistrationNumberNeededJobCounts).toHaveBeenCalledTimes(1);
    expect(fetchRegistrationNumberNeededJobCounts).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1' })
    );
  });

  it('reads as not yet emailed while the counts are pending or failed', async () => {
    vi.mocked(fetchRegistrationNumberNeededJobCounts).mockRejectedValue(new Error('offline'));
    const { api } = mountHook();
    await waitFor(() => expect(fetchRegistrationNumberNeededJobCounts).toHaveBeenCalled());

    expect(api.current?.hasEmailed('e1')).toBe(false);
  });

  it('opens no preview while the step is off or the exhibitor has no email', async () => {
    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(false));
    const off = mountHook();
    await waitFor(() => expect(fetchShowLifecycleEmailSummary).toHaveBeenCalled());
    act(() => off.api.current?.openEmail(target('e1', 'pat@example.com')));
    expect(off.view.queryByTestId('preview')).toBeNull();
    off.view.unmount();

    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(true));
    const on = mountHook();
    await openFor(on.api, target('e2', '  '));
    expect(on.view.queryByTestId('preview')).toBeNull();
  });

  it('opens the preview for a held entry with the dog, class and registry', async () => {
    const { api, view } = mountHook();
    await openFor(api, target('e1', 'pat@example.com'));

    expect(view.getByTestId('preview')).toBeInTheDocument();
    expect(dialog.current?.entry).toMatchObject({ dogName: 'Dog e1', registryName: 'AKC' });
    expect(dialog.current?.notNowLabel).toBe('Skip');
  });

  it('sends the first email on the plain key, as an entry-scoped job, and refreshes the counts', async () => {
    const { api } = mountHook();
    await openFor(api, target('e1', 'pat@example.com'));
    await waitFor(() => expect(fetchRegistrationNumberNeededJobCounts).toHaveBeenCalledTimes(1));
    vi.mocked(fetchRegistrationNumberNeededJobCounts).mockResolvedValue({ e1: 1 });
    await act(async () => {
      await dialog.current?.onSend(values);
    });

    expect(saveLifecycleEmailJobForLater).toHaveBeenCalledWith(
      expect.objectContaining({
        showId: 'show-1',
        stepType: 'registration_number_needed',
        recipientScope: 'entry',
        entryId: 'e1',
        recipientEmail: 'pat@example.com',
        idempotencyKey:
          'show-lifecycle-email:show-1:registration_number_needed:entry:single:e1:original',
      })
    );
    expect(sendLifecycleEmailJobs).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1', jobIds: ['job-1'] })
    );
    expect(toast.success).toHaveBeenCalledWith('Registration number email sent');
    // The row's label flips: the counts are read again after the send.
    await waitFor(() => expect(api.current?.hasEmailed('e1')).toBe(true));
  });

  it('prepares a fresh email with a sequenced key after an earlier one', async () => {
    vi.mocked(readRegistrationNumberNeededHistory).mockResolvedValue({
      count: 1,
      outstandingJobIds: [],
    });
    const { api } = mountHook();
    await openFor(api, target('e1', 'pat@example.com'));
    await act(async () => {
      await dialog.current?.onSend(values);
    });

    expect(saveLifecycleEmailJobForLater).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey:
          'show-lifecycle-email:show-1:registration_number_needed:entry:reminder-1:e1:original',
      })
    );
  });

  it('says so, and does not claim a send, when the number arrived first', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({
      sent: 0,
      failed: 0,
      skipped: 1,
      total: 1,
    });
    const { api } = mountHook();
    await openFor(api, target('e1', 'pat@example.com'));
    await act(async () => {
      await dialog.current?.onSend(values);
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      'No email was sent for Dog e1. Check the list: the number may already be on file.'
    );
  });

  it('reports a failed delivery and a thrown error without claiming success', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValueOnce({ sent: 0, failed: 1, total: 1 });
    const { api } = mountHook();
    await openFor(api, target('e1', 'pat@example.com'));
    await act(async () => {
      await dialog.current?.onSend(values);
    });
    expect(toast.error).toHaveBeenCalledWith(
      "The email couldn't be sent. It's still on the Scheduled emails list."
    );

    act(() => api.current?.openEmail(target('e1', 'pat@example.com')));
    vi.mocked(saveLifecycleEmailJobForLater).mockRejectedValueOnce(new Error('409'));
    await act(async () => {
      await dialog.current?.onSend(values);
    });
    expect(toast.error).toHaveBeenCalledWith('The email did not send. Try again.');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('Skip before anything was saved closes the preview and saves nothing', async () => {
    const { api, view } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));

    await act(async () => dialog.current?.onNotNow(values));

    expect(view.queryByTestId('preview')).toBeNull();
    expect(saveLifecycleEmailJobForLater).not.toHaveBeenCalled();
    expect(skipLifecycleEmailJobsForReview).not.toHaveBeenCalled();
  });

  it('Skip after a send that failed marks the SAVED job skipped before closing', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockRejectedValueOnce(new Error('network'));
    const { api, view } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));
    await act(async () => {
      await dialog.current?.onSend(values);
    });
    expect(view.getByTestId('preview')).toBeInTheDocument();

    await act(async () => dialog.current?.onNotNow(values));

    expect(skipLifecycleEmailJobsForReview).toHaveBeenCalledWith(
      expect.objectContaining({ jobIds: ['job-1'] })
    );
    expect(view.queryByTestId('preview')).toBeNull();
  });

  it('keeps the preview open and says so when the saved job cannot be withdrawn', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockRejectedValueOnce(new Error('network'));
    vi.mocked(skipLifecycleEmailJobsForReview).mockRejectedValueOnce(new Error('rls'));
    const { api, view } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));
    await act(async () => {
      await dialog.current?.onSend(values);
    });

    await act(async () => dialog.current?.onOpenChange(false));

    expect(view.getByTestId('preview')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "The saved email couldn't be withdrawn. Try Skip again."
    );
  });

  it('retries a failed send on the SAME saved job, with no second save or new key', async () => {
    vi.mocked(sendLifecycleEmailJobs)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ sent: 1, failed: 0, total: 1 });
    const { api } = mountHook();
    await openFor(api, target('e1', 'pat@example.com'));

    await act(async () => {
      await dialog.current?.onSend(values);
    });
    expect(screen.getByTestId('preview')).toBeInTheDocument();

    await act(async () => {
      await dialog.current?.onSend(values);
    });

    expect(saveLifecycleEmailJobForLater).toHaveBeenCalledTimes(1);
    expect(readRegistrationNumberNeededHistory).toHaveBeenCalledTimes(1);
    expect(sendLifecycleEmailJobs).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendLifecycleEmailJobs).mock.calls[1]![0]).toMatchObject({
      jobIds: ['job-1'],
    });
    expect(toast.success).toHaveBeenCalledWith('Registration number email sent');
  });

  it('withdraws an earlier unsent email before saving a new one, so only one can be sent', async () => {
    vi.mocked(readRegistrationNumberNeededHistory).mockResolvedValue({
      count: 2,
      outstandingJobIds: ['job-failed'],
    });
    const { api } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));

    await act(async () => {
      await dialog.current?.onSend(values);
    });

    expect(skipLifecycleEmailJobsForReview).toHaveBeenCalledWith(
      expect.objectContaining({ jobIds: ['job-failed'] })
    );
    expect(vi.mocked(skipLifecycleEmailJobsForReview).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(saveLifecycleEmailJobForLater).mock.invocationCallOrder[0]!
    );
  });

  it('says only what is certain when the server skips the email', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValueOnce({
      sent: 0,
      failed: 0,
      total: 1,
      skipped: 1,
    });
    const { api } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));

    await act(async () => {
      await dialog.current?.onSend(values);
    });

    const message = vi.mocked(toast.info).mock.calls.at(-1)?.[0] as string;
    expect(message).toContain('No email was sent');
    expect(message).not.toMatch(/now has a registration number/);
  });

  it('ignores Skip and close while its send is in flight, then closes when the send lands', async () => {
    let finishFirst: (value: { sent: number; failed: number; total: number }) => void = () =>
      undefined;
    vi.mocked(sendLifecycleEmailJobs).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishFirst = resolve;
        })
    );
    const { api } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));
    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = dialog.current?.onSend(values);
      await Promise.resolve();
    });

    // Withdrawing the job now would race the send for its final state.
    await act(async () => dialog.current?.onNotNow(values));
    await act(async () => dialog.current?.onOpenChange(false));
    expect(skipLifecycleEmailJobsForReview).not.toHaveBeenCalled();
    expect(screen.getByTestId('preview')).toBeInTheDocument();
    // Nor can another preview replace it mid-send.
    act(() => api.current?.openEmail(target('e2', 'b@example.com')));
    expect(dialog.current?.entry.dogName).toBe('Dog e1');

    await act(async () => {
      finishFirst({ sent: 1, failed: 0, total: 1 });
      await firstSend;
    });

    expect(screen.queryByTestId('preview')).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Registration number email sent');
  });
});
