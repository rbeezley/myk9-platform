import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { toast } from 'sonner';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { useEntryDecisionLifecycleEmails } from './useEntryDecisionLifecycleEmails';
import { sendLifecycleEmailJobs } from './api';

const dialogProps = vi.hoisted(() => ({
  current: null as null | {
    onSend: (values: { subject: string; body: string; secretaryNote: string }) => Promise<void>;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./LifecycleEmailPreviewDialog', () => ({
  LifecycleEmailPreviewDialog: (props: NonNullable<typeof dialogProps.current>) => {
    dialogProps.current = props;
    return null;
  },
}));
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchEntryDecisionEmailStatuses: vi.fn().mockResolvedValue({}),
  fetchShowLifecycleEmailSummary: vi.fn().mockResolvedValue({ steps: [] }),
  saveLifecycleEmailJobForLater: vi.fn().mockResolvedValue('job-1'),
  sendLifecycleEmailJobs: vi.fn(),
}));

const entry = {
  id: 'entry-1',
  showId: 'show-1',
  entryStatus: EntryStatus.ACCEPTED,
  classes: [],
  totalFee: 0,
  paidAmount: 0,
} as unknown as EntryManagementEntry;

async function sendDecisionEmail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let openPrompt: ReturnType<typeof useEntryDecisionLifecycleEmails>['openDecisionPrompt'] | null =
    null;
  function Harness() {
    const hook = useEntryDecisionLifecycleEmails({
      showId: 'show-1',
      showName: 'Show',
      entries: [entry],
    });
    openPrompt = hook.openDecisionPrompt;
    return <>{hook.dialog}</>;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
  act(() => openPrompt?.(entry, 'accepted'));
  await act(async () => {
    await dialogProps.current?.onSend({ subject: 's', body: 'b', secretaryNote: '' });
  });
}

describe('useEntryDecisionLifecycleEmails send result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialogProps.current = null;
  });

  it('shows the calm failure toast, not success, when the send reports a failure', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 0, failed: 1, total: 1 });
    await sendDecisionEmail();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "The decision email couldn't be sent. It's still on the list to send again."
    );
  });

  it('keeps the success toast when the send succeeds', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 1, failed: 0, total: 1 });
    await sendDecisionEmail();
    expect(toast.success).toHaveBeenCalledWith('Decision email sent');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps the existing error toast when the send throws', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockRejectedValue(new Error('boom'));
    await sendDecisionEmail();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Entry decision is saved. The email did not send yet.'
    );
  });
});
