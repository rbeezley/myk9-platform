/**
 * MYK9-1800 (owner decision 2026-11-09): after an Accept or Waitlist, the email goes by
 * itself when the show's switch for that email is on. It waits out the Undo window first,
 * and never announces a decision that was taken back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { STATUS_UNDO_WINDOW_MS } from '@/lib/undoToast';
import { useEntryDecisionLifecycleEmails } from './useEntryDecisionLifecycleEmails';
import { DECISION_EMAIL_SEND_DELAY_MS } from './useAutoSendDecisionEmail';
import {
  fetchShowLifecycleEmailSummary,
  saveLifecycleEmailJobForLater,
  sendLifecycleEmailJobs,
} from './api';

const dialogOpen = vi.hoisted(() => ({ current: false }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./LifecycleEmailPreviewDialog', () => ({
  LifecycleEmailPreviewDialog: () => {
    dialogOpen.current = true;
    return null;
  },
}));
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchEntryDecisionEmailStatuses: vi.fn().mockResolvedValue({}),
  fetchShowLifecycleEmailSummary: vi.fn(),
  saveLifecycleEmailJobForLater: vi.fn(),
  sendLifecycleEmailJobs: vi.fn(),
}));

const accepted = {
  id: 'entry-1',
  showId: 'show-1',
  registrationId: 'reg-1',
  entryStatus: EntryStatus.ACCEPTED,
  ownerName: 'Pat Lee',
  ownerEmail: 'pat@example.com',
  dogName: 'Maple',
  classes: [],
  totalFee: 0,
  paidAmount: 0,
} as unknown as EntryManagementEntry;

type Hook = ReturnType<typeof useEntryDecisionLifecycleEmails>;

function summaryWith(acceptedEnabled: boolean | undefined) {
  const steps =
    acceptedEnabled === undefined ? [] : [{ stepType: 'accepted', isEnabled: acceptedEnabled }];
  return { steps } as unknown as Awaited<ReturnType<typeof fetchShowLifecycleEmailSummary>>;
}

async function mountHook(acceptedEnabled: boolean | undefined) {
  vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summaryWith(acceptedEnabled));
  let announce: Hook['announceDecision'] | null = null;
  function Harness({ entries }: { entries: EntryManagementEntry[] }) {
    const value = useEntryDecisionLifecycleEmails({
      showId: 'show-1',
      showName: 'Fall Classic',
      entries,
    });
    useEffect(() => {
      announce = value.announceDecision;
    });
    return <>{value.dialog}</>;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (entries: EntryManagementEntry[]) => (
    <QueryClientProvider client={client}>
      <Harness entries={entries} />
    </QueryClientProvider>
  );
  const view = render(tree([accepted]));
  // The switch has to be known, and rendered, before a decision is announced. react-query
  // delivers a result on a zero-delay timer, so this is settled on real timers first.
  await waitFor(() =>
    expect(client.getQueryState(['show-lifecycle-emails', 'show-1'])?.status).toBe('success')
  );
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  vi.useFakeTimers();
  return {
    accept: () => act(() => announce?.(accepted, 'accepted')),
    undo: () => view.rerender(tree([{ ...accepted, entryStatus: EntryStatus.PENDING }])),
    leavePage: () => view.unmount(),
    wait: (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms)),
  };
}

describe('automatic decision email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialogOpen.current = false;
    vi.mocked(saveLifecycleEmailJobForLater).mockResolvedValue('job-1');
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 1, failed: 0, total: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the default acceptance email once the Undo window has passed, with no preview', async () => {
    const page = await mountHook(true);
    page.accept();

    await page.wait(STATUS_UNDO_WINDOW_MS);
    expect(saveLifecycleEmailJobForLater).not.toHaveBeenCalled();

    await page.wait(DECISION_EMAIL_SEND_DELAY_MS - STATUS_UNDO_WINDOW_MS);

    expect(dialogOpen.current).toBe(false);
    expect(saveLifecycleEmailJobForLater).toHaveBeenCalledWith(
      expect.objectContaining({
        stepType: 'accepted',
        entryId: 'entry-1',
        recipientEmail: 'pat@example.com',
        subject: 'Entry accepted - Fall Classic',
        secretaryNote: '',
      })
    );
    expect(sendLifecycleEmailJobs).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1', jobIds: ['job-1'] })
    );
    expect(toast.success).toHaveBeenCalledWith('Acceptance email sent to Pat Lee');
  });

  it('sends nothing and saves nothing when she Undoes inside the window', async () => {
    const page = await mountHook(true);
    page.accept();
    await page.wait(1000);

    page.undo();
    await page.wait(DECISION_EMAIL_SEND_DELAY_MS);

    expect(saveLifecycleEmailJobForLater).not.toHaveBeenCalled();
    expect(sendLifecycleEmailJobs).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('sends once when she decides the same entry twice inside the window', async () => {
    const page = await mountHook(true);
    page.accept();
    await page.wait(2000);
    page.accept();

    await page.wait(DECISION_EMAIL_SEND_DELAY_MS);

    expect(sendLifecycleEmailJobs).toHaveBeenCalledTimes(1);
  });

  it('does not drop the email when she leaves the page inside the window', async () => {
    const page = await mountHook(true);
    page.accept();
    await page.wait(1000);

    page.leavePage();
    await page.wait(0);

    expect(sendLifecycleEmailJobs).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all when the show has that email switched off', async () => {
    const page = await mountHook(false);
    page.accept();

    await page.wait(DECISION_EMAIL_SEND_DELAY_MS);

    expect(dialogOpen.current).toBe(false);
    expect(saveLifecycleEmailJobForLater).not.toHaveBeenCalled();
  });

  it('falls back to the preview when the switch is not known', async () => {
    const page = await mountHook(undefined);
    page.accept();

    await page.wait(DECISION_EMAIL_SEND_DELAY_MS);

    expect(dialogOpen.current).toBe(true);
    expect(saveLifecycleEmailJobForLater).not.toHaveBeenCalled();
  });

  it('says so, and where the email is, when delivery fails', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 0, failed: 1, total: 1 });
    const page = await mountHook(true);
    page.accept();

    await page.wait(DECISION_EMAIL_SEND_DELAY_MS);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Entry decision is saved. The acceptance email did not send. Press "Email ready" on the entry to try again.'
    );
    expect(dialogOpen.current).toBe(false);
  });

  it('opens the preview for her to send when the email could not even be prepared', async () => {
    vi.mocked(saveLifecycleEmailJobForLater).mockRejectedValue(new Error('offline'));
    const page = await mountHook(true);
    page.accept();

    await page.wait(DECISION_EMAIL_SEND_DELAY_MS);

    expect(sendLifecycleEmailJobs).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Entry decision is saved. The acceptance email is open for you to send.'
    );
    expect(dialogOpen.current).toBe(true);
  });
});
