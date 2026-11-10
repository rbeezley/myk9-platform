/**
 * MYK9-1800 (owner decision 2026-11-09): once an Accept or Waitlist has stood, the email goes
 * with no preview. This hook is only ever called for a decision that stood, so it has no
 * timers; these tests cover what it does with the entry it is handed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { useSendDecisionEmail } from './useSendDecisionEmail';
import {
  saveLifecycleEmailJobForLater,
  sendLifecycleEmailJobs,
  type EntryDecisionEmailJob,
  type EntryDecisionEmailStatus,
} from './api';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
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
  armbandNumber: '742',
  classes: [],
  totalFee: 0,
  paidAmount: 0,
} as unknown as EntryManagementEntry;

function job(overrides: Partial<EntryDecisionEmailJob>): EntryDecisionEmailJob {
  return {
    id: 'job-0',
    entryId: 'entry-1',
    stepType: 'accepted',
    status: 'sent',
    subject: '',
    body: '',
    secretaryNote: '',
    dueAt: null,
    preparedAt: null,
    sentAt: null,
    correctionForJobId: null,
    ...overrides,
  };
}

function statusWith(overrides: Partial<EntryDecisionEmailStatus>) {
  return {
    'entry-1': {
      entryId: 'entry-1',
      readyJob: null,
      failedJob: null,
      sentDecisionJob: null,
      sentCorrectionJob: null,
      ...overrides,
    },
  };
}

function mount(statusMap: Record<string, EntryDecisionEmailStatus> = {}) {
  const onSettled = vi.fn();
  const { result } = renderHook(() =>
    useSendDecisionEmail({ statusMap, showName: 'Fall Classic', onSettled })
  );
  return { send: result.current, onSettled };
}

type ToastOptions = { id?: string; duration?: number; action?: { onClick: () => void } };
const lastOptions = (tone: 'info' | 'error') =>
  vi.mocked(toast[tone]).mock.calls.at(-1)?.[1] as ToastOptions;

describe('useSendDecisionEmail', () => {
  let online: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    vi.mocked(saveLifecycleEmailJobForLater).mockResolvedValue('job-1');
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 1, failed: 0, total: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves and sends the default acceptance email, written from the entry it is handed', async () => {
    const { send, onSettled } = mount();
    send(accepted, 'accepted');

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Acceptance email sent to Pat Lee', {
        id: 'decision-email:entry-1',
      })
    );
    expect(saveLifecycleEmailJobForLater).toHaveBeenCalledWith(
      expect.objectContaining({
        stepType: 'accepted',
        entryId: 'entry-1',
        recipientEmail: 'pat@example.com',
        subject: 'Entry accepted - Fall Classic',
        // The armband the Accept itself assigned is in the email.
        body: expect.stringContaining('Armband: 742'),
        secretaryNote: '',
      })
    );
    expect(sendLifecycleEmailJobs).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1', jobIds: ['job-1'] })
    );
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('names the waitlist email for a waitlist decision', async () => {
    const { send } = mount();
    send({ ...accepted, entryStatus: EntryStatus.WAITLIST }, 'waitlisted');

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Waitlist email sent to Pat Lee',
        expect.anything()
      )
    );
  });

  it('says so and saves nothing when the exhibitor has no email on file', async () => {
    const { send } = mount();
    send({ ...accepted, ownerEmail: '  ' }, 'accepted');

    expect(toast.info).toHaveBeenCalledWith(
      'Pat Lee has no email on file, so no acceptance email was sent.'
    );
    await Promise.resolve();
    expect(saveLifecycleEmailJobForLater).not.toHaveBeenCalled();
    expect(sendLifecycleEmailJobs).not.toHaveBeenCalled();
  });

  it.each([
    ['is waiting to be sent', { readyJob: job({ status: 'ready' }) }],
    ['failed to deliver', { failedJob: job({ status: 'failed' }) }],
    ['was already sent', { sentDecisionJob: job({ status: 'sent' }) }],
  ])('stays silent when an email for this decision %s', async (_label, overrides) => {
    const { send } = mount(statusWith(overrides));
    send(accepted, 'accepted');

    await Promise.resolve();
    expect(saveLifecycleEmailJobForLater).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still sends an acceptance when the only email on the entry is an earlier waitlist one', async () => {
    const { send } = mount(statusWith({ sentDecisionJob: job({ stepType: 'waitlisted' }) }));
    send(accepted, 'accepted');

    await waitFor(() => expect(sendLifecycleEmailJobs).toHaveBeenCalledTimes(1));
  });

  it('holds the email while offline, and sends it from the notice once back online', async () => {
    online = false;
    const { send } = mount();
    send(accepted, 'accepted');

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "You're offline, so the acceptance email to Pat Lee has not gone yet.",
        expect.objectContaining({ id: 'decision-email:entry-1', duration: Infinity })
      )
    );
    expect(saveLifecycleEmailJobForLater).not.toHaveBeenCalled();

    online = true;
    lastOptions('info').action?.onClick();

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Acceptance email sent to Pat Lee',
        expect.anything()
      )
    );
  });

  it('keeps a notice with Try again when the email could not be saved', async () => {
    vi.mocked(saveLifecycleEmailJobForLater).mockRejectedValueOnce(new Error('network'));
    const { send } = mount();
    send(accepted, 'accepted');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The acceptance email to Pat Lee could not be sent.',
        expect.objectContaining({ duration: Infinity })
      )
    );
    expect(sendLifecycleEmailJobs).not.toHaveBeenCalled();

    lastOptions('error').action?.onClick();

    await waitFor(() => expect(sendLifecycleEmailJobs).toHaveBeenCalledTimes(1));
  });

  it('says the email is on the entry when it was saved but did not deliver', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 0, failed: 1, total: 1 });
    const { send, onSettled } = mount();
    send(accepted, 'accepted');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The acceptance email to Pat Lee did not send. It is on the entry for you to send again.',
        { id: 'decision-email:entry-1' }
      )
    );
    expect(toast.success).not.toHaveBeenCalled();
    // The entry's badge has to pick the failed job up.
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
