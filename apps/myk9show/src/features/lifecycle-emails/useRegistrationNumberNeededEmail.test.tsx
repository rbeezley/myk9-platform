import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
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
} from './api';
import { countRegistrationNumberNeededJobs } from './registrationNumberNeeded';
import type { LifecycleEmailScheduledSummary } from './readModel';

interface DialogProps {
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
}));
vi.mock('./registrationNumberNeeded', async importOriginal => ({
  ...(await importOriginal<typeof import('./registrationNumberNeeded')>()),
  countRegistrationNumberNeededJobs: vi.fn(),
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

describe('useRegistrationNumberNeededEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialog.current = null;
    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(true));
    vi.mocked(countRegistrationNumberNeededJobs).mockResolvedValue(0);
    vi.mocked(saveLifecycleEmailJobForLater).mockResolvedValue('job-1');
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 1, failed: 0, total: 1 });
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

  it('offers the preview for a held entry with an email, and reports the one without', async () => {
    const { api, view } = mountHook();
    let result: Awaited<ReturnType<Hook['offer']>> | undefined;
    await act(async () => {
      result = await api.current?.offer([target('e1', 'pat@example.com'), target('e2', '')]);
    });

    expect(view.getByTestId('preview')).toBeInTheDocument();
    expect(dialog.current?.entry).toMatchObject({ dogName: 'Dog e1', registryName: 'AKC' });
    expect(result?.disabled).toBe(false);
    expect(result?.noEmail.map(item => item.entry.id)).toEqual(['e2']);
  });

  it('offers nothing when the club turned the step off', async () => {
    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(false));
    const { api, view } = mountHook();
    let result: Awaited<ReturnType<Hook['offer']>> | undefined;
    await act(async () => {
      result = await api.current?.offer([target('e1', 'pat@example.com')]);
    });

    expect(view.queryByTestId('preview')).toBeNull();
    expect(result).toEqual({ disabled: true, noEmail: [] });
  });

  it('sends no reminder while the step is off or the exhibitor has no email', async () => {
    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(false));
    const off = mountHook();
    await waitFor(() => expect(fetchShowLifecycleEmailSummary).toHaveBeenCalled());
    act(() => off.api.current?.sendReminder(target('e1', 'pat@example.com')));
    expect(off.view.queryByTestId('preview')).toBeNull();
    off.view.unmount();

    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(true));
    const on = mountHook();
    await waitFor(() => expect(on.api.current?.stepEnabled).toBe(true));
    act(() => on.api.current?.sendReminder(target('e2', '  ')));
    expect(on.view.queryByTestId('preview')).toBeNull();
  });

  it('sends the first email on the plain key, as an entry-scoped job', async () => {
    const { api } = mountHook();
    await act(async () => {
      await api.current?.offer([target('e1', 'pat@example.com')]);
    });
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
  });

  it('prepares a fresh reminder with a sequenced key after an earlier email', async () => {
    vi.mocked(countRegistrationNumberNeededJobs).mockResolvedValue(1);
    const { api } = mountHook();
    await waitFor(() => expect(api.current?.stepEnabled).toBe(true));
    act(() => api.current?.sendReminder(target('e1', 'pat@example.com')));
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
    await act(async () => {
      await api.current?.offer([target('e1', 'pat@example.com')]);
    });
    await act(async () => {
      await dialog.current?.onSend(values);
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      'Dog e1 now has a registration number, so no email was sent.'
    );
  });

  it('reports a failed delivery and a thrown error without claiming success', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValueOnce({ sent: 0, failed: 1, total: 1 });
    const { api } = mountHook();
    await act(async () => {
      await api.current?.offer([target('e1', 'pat@example.com')]);
    });
    await act(async () => {
      await dialog.current?.onSend(values);
    });
    expect(toast.error).toHaveBeenCalledWith(
      "The email couldn't be sent. It's still on the Scheduled emails list."
    );

    vi.mocked(saveLifecycleEmailJobForLater).mockRejectedValueOnce(new Error('409'));
    await act(async () => {
      await dialog.current?.onSend(values);
    });
    expect(toast.error).toHaveBeenCalledWith('The email did not send. Try Send reminder again.');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('Skip saves nothing and moves on to the next entry', async () => {
    const { api } = mountHook();
    await act(async () => {
      await api.current?.offer([target('e1', 'a@example.com'), target('e2', 'b@example.com')]);
    });
    expect(dialog.current?.entry.dogName).toBe('Dog e1');
    expect(dialog.current?.notNowLabel).toBe('Skip');

    act(() => dialog.current?.onNotNow(values));

    expect(dialog.current?.entry.dogName).toBe('Dog e2');
    expect(saveLifecycleEmailJobForLater).not.toHaveBeenCalled();
  });
});
