/**
 * MYK9-1800 (owner decision 2026-11-09): once an Accept or Waitlist has stood, the email goes
 * with no preview. This hook is only ever called for a decision that stood. It acts once and
 * keeps nothing to act on later: no timers, no retry buttons.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { useSendDecisionEmail } from './useSendDecisionEmail';
import {
  LifecycleEmailAlreadySavedError,
  saveLifecycleEmailJobForLater,
  sendLifecycleEmailJobs,
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

function mount() {
  const onSettled = vi.fn();
  const { result } = renderHook(() =>
    useSendDecisionEmail({ showName: 'Fall Classic', onSettled })
  );
  return { send: result.current, onSettled };
}

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
      expect(toast.success).toHaveBeenCalledWith('Acceptance email sent to Pat Lee')
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
      expect(toast.success).toHaveBeenCalledWith('Waitlist email sent to Pat Lee')
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

  it('stays silent when the server already holds an email for this entry and decision', async () => {
    // Accepted and emailed, moved to the waitlist, accepted again: the first acceptance
    // job still owns the key. That is "already on file", not a failure to tell her about.
    vi.mocked(saveLifecycleEmailJobForLater).mockRejectedValue(
      new LifecycleEmailAlreadySavedError()
    );
    const { send, onSettled } = mount();
    send(accepted, 'accepted');

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(sendLifecycleEmailJobs).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('sends nothing while offline, and points at the button that will', async () => {
    online = false;
    const { send } = mount();
    send(accepted, 'accepted');

    expect(toast.error).toHaveBeenCalledWith(
      'You\'re offline, so the acceptance email to Pat Lee was not sent. When you are back online, use "Email Exhibitor" on the entry.'
    );
    await Promise.resolve();
    expect(saveLifecycleEmailJobForLater).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the email could not be saved',
      () => vi.mocked(saveLifecycleEmailJobForLater).mockRejectedValue(new Error('network')),
    ],
    [
      'it was saved but did not deliver',
      () => vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 0, failed: 1, total: 1 }),
    ],
    [
      'the send call itself failed',
      () => vi.mocked(sendLifecycleEmailJobs).mockRejectedValue(new Error('boom')),
    ],
  ])('says the email did not send, with no retry button, when %s', async (_label, arrange) => {
    arrange();
    const { send, onSettled } = mount();
    send(accepted, 'accepted');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The acceptance email to Pat Lee did not send. Use "Email Exhibitor" on the entry to let them know.'
      )
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
