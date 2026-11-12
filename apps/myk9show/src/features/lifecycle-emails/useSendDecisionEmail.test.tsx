import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { renderHook, waitFor } from '@/test/utils/testUtils';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { useSendDecisionEmail } from './useSendDecisionEmail';
import { saveDecisionEmailJob } from './saveDecisionEmailJob';
import { sendLifecycleEmailJobs } from './api';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./saveDecisionEmailJob', () => ({ saveDecisionEmailJob: vi.fn() }));
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  sendLifecycleEmailJobs: vi.fn(),
}));

const showAEntry = {
  id: 'entry-a',
  showId: 'show-a',
  registrationId: 'registration-a',
  ownerName: 'Pat Owner',
  ownerEmail: 'pat@example.com',
  dogName: 'Rex',
  entryStatus: EntryStatus.ACCEPTED,
  classes: [],
  totalFee: 0,
  paidAmount: 0,
} as unknown as EntryManagementEntry;

describe('useSendDecisionEmail after a show switch (MYK9-1833)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveDecisionEmailJob).mockResolvedValue('job-1');
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 1, failed: 0, total: 1 });
  });

  it('writes the email with the show the decision was made on, not the show now on screen', async () => {
    const view = renderHook(
      ({ showName }: { showName: string }) =>
        useSendDecisionEmail({ showName, onSettled: vi.fn() }),
      { initialProps: { showName: 'Show A' } }
    );
    view.rerender({ showName: 'Show B' });

    view.result.current(showAEntry, 'accepted', 'Show A');

    await waitFor(() =>
      expect(sendLifecycleEmailJobs).toHaveBeenCalledWith(
        expect.objectContaining({ showId: 'show-a', jobIds: ['job-1'] })
      )
    );
    const draft = vi.mocked(saveDecisionEmailJob).mock.calls[0]?.[2];
    expect(vi.mocked(saveDecisionEmailJob).mock.calls[0]?.[0]).toBe(showAEntry);
    expect(draft?.body).toContain('Show A');
    expect(draft?.body).not.toContain('Show B');
  });

  function sender(showName: string, onSettled = vi.fn()) {
    return renderHook(() => useSendDecisionEmail({ showName, onSettled })).result.current;
  }

  it('names the dog in the success toast, and the show only when it is not the one on screen', async () => {
    sender('Show B')(showAEntry, 'accepted', 'Show A');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Acceptance email sent to Pat Owner for Rex at Show A'
      )
    );

    vi.mocked(toast.success).mockClear();
    sender('Show A')(showAEntry, 'accepted', 'Show A');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Acceptance email sent to Pat Owner for Rex')
    );
  });

  it('names the dog and show in the failure toast after a switch', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 0, failed: 1, total: 1 });
    sender('Show B')(showAEntry, 'waitlisted', 'Show A');
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The waitlist email to Pat Owner for Rex at Show A did not send. Go back to Show A and use "Email Exhibitor" on Rex\'s entry to let them know.'
      )
    );
  });

  it('keeps the failure advice short on the same show', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 0, failed: 1, total: 1 });
    sender('Show A')(showAEntry, 'waitlisted', 'Show A');
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The waitlist email to Pat Owner for Rex did not send. Use "Email Exhibitor" on Rex\'s entry to let them know.'
      )
    );
  });

  it('names the dog and show when offline after a switch, and says to go back', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      sender('Show B')(showAEntry, 'accepted', 'Show A');
      expect(toast.error).toHaveBeenCalledWith(
        'You\'re offline, so the acceptance email to Pat Owner for Rex at Show A was not sent. When you are back online, go back to Show A and use "Email Exhibitor" on Rex\'s entry.'
      );
      expect(saveDecisionEmailJob).not.toHaveBeenCalled();
    } finally {
      online.mockRestore();
    }
  });

  it('names the dog and show when the exhibitor has no email, after a switch', () => {
    sender('Show B')({ ...showAEntry, ownerEmail: '' }, 'accepted', 'Show A');
    expect(toast.info).toHaveBeenCalledWith(
      'Pat Owner has no email on file, so no acceptance email was sent for Rex at Show A.'
    );
  });

  it('leaves the show out when the decided-on show has no name', async () => {
    sender('Show B')(showAEntry, 'accepted', 'this show');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Acceptance email sent to Pat Owner for Rex')
    );
  });

  it('refreshes the lifecycle email caches of the show the decision was made on', async () => {
    const onSettled = vi.fn();
    sender('Show B', onSettled)(showAEntry, 'accepted', 'Show A');
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith('show-a'));
  });
});
