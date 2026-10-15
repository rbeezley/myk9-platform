import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as lifecycleApi from './api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  useRegistrationNumberNeededEmail,
  type RegistrationNumberNeededTarget,
} from './useRegistrationNumberNeededEmail';
import { fetchShowLifecycleEmailSummary } from './api';
import {
  fetchRegistrationNumberNeededJobCounts,
  sendRegistrationNumberNeededEmail,
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
  fetchRegistrationNumberNeededJobCounts: vi.fn(),
  sendRegistrationNumberNeededEmail: vi.fn(),
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
  return { api, view, queryClient };
}

const values = { subject: 's', body: 'b', secretaryNote: '' };

async function openFor(api: { current: Hook | null }, t: RegistrationNumberNeededTarget) {
  await waitFor(() => expect(api.current?.stepEnabled).toBe(true));
  act(() => api.current?.openEmail(t));
}

const send = async () => {
  await act(async () => {
    await dialog.current?.onSend(values);
  });
};

describe('useRegistrationNumberNeededEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialog.current = null;
    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(true));
    vi.mocked(fetchRegistrationNumberNeededJobCounts).mockResolvedValue({});
    vi.mocked(sendRegistrationNumberNeededEmail).mockResolvedValue({
      status: 'sent',
      jobId: 'job-1',
    });
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

  it('opens the preview with the dog, class and registry', async () => {
    const { api, view } = mountHook();
    await openFor(api, target('e1', 'pat@example.com'));

    expect(view.getByTestId('preview')).toBeInTheDocument();
    expect(dialog.current?.entry).toMatchObject({ dogName: 'Dog e1', registryName: 'AKC' });
    expect(dialog.current?.notNowLabel).toBe('Skip');
  });

  it('sends the reviewed text through the one server action, then closes and refreshes every read', async () => {
    const { api, view, queryClient } = mountHook();
    await openFor(api, target('e1', 'pat@example.com'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await send();

    expect(sendRegistrationNumberNeededEmail).toHaveBeenCalledTimes(1);
    expect(sendRegistrationNumberNeededEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        showId: 'show-1',
        entryId: 'e1',
        subject: 's',
        body: 'b',
        secretaryNote: '',
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Registration number email sent');
    expect(view.queryByTestId('preview')).toBeNull();
    const keys = invalidate.mock.calls.map(call => JSON.stringify(call[0]?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(['show-lifecycle-emails', 'show-1']),
        JSON.stringify(['registration-number-needed-jobs', 'show-1']),
        JSON.stringify(['show-lifecycle-email-review', 'show-1']),
      ])
    );
  });

  it('says exactly what happened for each outcome, and closes the preview', async () => {
    const cases: Array<[Awaited<ReturnType<typeof sendRegistrationNumberNeededEmail>>, string]> = [
      [
        { status: 'failed', jobId: 'j' },
        "The email couldn't be sent. Press Send reminder to try again.",
      ],
      [{ status: 'busy' }, 'An email for Dog e1 is already being sent.'],
      [
        { status: 'skipped', reason: 'not_held' },
        'No email was sent for Dog e1: the registration number is on file.',
      ],
      [
        { status: 'skipped', reason: 'unverified' },
        "No email was sent for Dog e1: the registration number couldn't be checked. Try again.",
      ],
      [
        { status: 'skipped', reason: 'no_email' },
        'No email on file for Dog e1. Contact them by phone.',
      ],
    ];
    for (const [outcome, message] of cases) {
      vi.clearAllMocks();
      vi.mocked(sendRegistrationNumberNeededEmail).mockResolvedValue(outcome);
      const { api, view } = mountHook();
      await openFor(api, target('e1', 'pat@example.com'));
      await send();

      const toasts = [
        ...vi.mocked(toast.info).mock.calls,
        ...vi.mocked(toast.error).mock.calls,
      ].map(call => call[0]);
      expect(toasts, JSON.stringify(outcome)).toContain(message);
      expect(toast.success).not.toHaveBeenCalled();
      expect(view.queryByTestId('preview')).toBeNull();
      view.unmount();
    }
  });

  it('keeps the preview open and says so when the call throws, so Send can be pressed again', async () => {
    vi.mocked(sendRegistrationNumberNeededEmail).mockRejectedValueOnce(new Error('network'));
    const { api, view } = mountHook();
    await openFor(api, target('e1', 'pat@example.com'));
    await send();

    expect(toast.error).toHaveBeenCalledWith('The email did not send. Try again.');
    expect(view.getByTestId('preview')).toBeInTheDocument();

    await send();
    expect(toast.success).toHaveBeenCalledWith('Registration number email sent');
    expect(view.queryByTestId('preview')).toBeNull();
  });

  it('Skip and close make no network call at all', async () => {
    const { api, view } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));
    const callsBefore = vi.mocked(fetchRegistrationNumberNeededJobCounts).mock.calls.length;
    const summaryCallsBefore = vi.mocked(fetchShowLifecycleEmailSummary).mock.calls.length;

    await act(async () => dialog.current?.onNotNow(values));
    expect(view.queryByTestId('preview')).toBeNull();

    act(() => api.current?.openEmail(target('e1', 'a@example.com')));
    await act(async () => dialog.current?.onOpenChange(false));
    expect(view.queryByTestId('preview')).toBeNull();

    expect(sendRegistrationNumberNeededEmail).not.toHaveBeenCalled();
    expect(vi.mocked(lifecycleApi.saveLifecycleEmailJobForLater)).not.toHaveBeenCalled();
    expect(vi.mocked(lifecycleApi.skipLifecycleEmailJobsForReview)).not.toHaveBeenCalled();
    expect(vi.mocked(fetchRegistrationNumberNeededJobCounts).mock.calls.length).toBe(callsBefore);
    expect(vi.mocked(fetchShowLifecycleEmailSummary).mock.calls.length).toBe(summaryCallsBefore);
  });

  it('ignores Skip and close while the send is in flight, then closes only its own preview', async () => {
    let finish: (value: { status: 'sent'; jobId: string }) => void = () => undefined;
    vi.mocked(sendRegistrationNumberNeededEmail).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const { api, view } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = dialog.current?.onSend(values);
      await Promise.resolve();
    });

    await act(async () => dialog.current?.onNotNow(values));
    await act(async () => dialog.current?.onOpenChange(false));
    expect(view.getByTestId('preview')).toBeInTheDocument();

    await act(async () => {
      finish({ status: 'sent', jobId: 'j' });
      await pending;
    });
    expect(view.queryByTestId('preview')).toBeNull();
  });

  it('a second Send press while one is in flight sends once', async () => {
    let finish: (value: { status: 'sent'; jobId: string }) => void = () => undefined;
    vi.mocked(sendRegistrationNumberNeededEmail).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const { api } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));
    let first: Promise<void> | undefined;
    await act(async () => {
      first = dialog.current?.onSend(values);
      await dialog.current?.onSend(values);
    });
    await act(async () => {
      finish({ status: 'sent', jobId: 'j' });
      await first;
    });

    expect(sendRegistrationNumberNeededEmail).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('preview')).toBeNull();
  });

  it('a retry in the same preview reuses its request id; a new preview gets a new one', async () => {
    vi.mocked(sendRegistrationNumberNeededEmail).mockRejectedValueOnce(new Error('network'));
    const { api } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));

    await act(async () => {
      await dialog.current?.onSend(values);
    });
    await act(async () => {
      await dialog.current?.onSend(values);
    });
    await openFor(api, target('e1', 'a@example.com'));
    await act(async () => {
      await dialog.current?.onSend(values);
    });

    const ids = vi
      .mocked(sendRegistrationNumberNeededEmail)
      .mock.calls.map(([args]) => (args as { requestId: string }).requestId);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it('says the earlier email went out when the server recovered it instead', async () => {
    vi.mocked(sendRegistrationNumberNeededEmail).mockResolvedValueOnce({
      status: 'sent',
      jobId: 'earlier',
      recovered: true,
    });
    const { api } = mountHook();
    await openFor(api, target('e1', 'a@example.com'));

    await act(async () => {
      await dialog.current?.onSend(values);
    });

    expect(toast.success).toHaveBeenCalledWith(
      "The earlier email to Dog e1's owner has been sent. Send a reminder if you changed the text."
    );
  });
});
