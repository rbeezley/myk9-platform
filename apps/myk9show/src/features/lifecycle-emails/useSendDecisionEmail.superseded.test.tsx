import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { renderHook, waitFor } from '@/test/utils/testUtils';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { useSendDecisionEmail } from './useSendDecisionEmail';
import { saveDecisionEmailJob } from './saveDecisionEmailJob';
import { sendLifecycleEmailJobs } from './api';

// MYK9-1974: the send server re-reads the entry. The hook reports what the server found and
// never claims a send the server refused. No real email: the API is mocked.

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

const STAYS = { duration: Infinity };

function sendFromShowA() {
  const send = renderHook(() => useSendDecisionEmail({ onSettled: vi.fn() })).result.current;
  // She accepted on show A, then moved to show B inside the Undo window.
  window.history.pushState({}, '', '/shows/show-b/entries');
  send([showAEntry], 'accepted', 'Show A');
}

describe('useSendDecisionEmail when the server re-checks the decision (MYK9-1974)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveDecisionEmailJob).mockResolvedValue('job-1');
  });
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('says the email was not sent when another operator changed the entry since', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({
      sent: 0,
      failed: 0,
      skipped: 1,
      total: 1,
    });

    sendFromShowA();

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "The acceptance email to Pat Owner for Rex at Show A was not sent, because the entry's status changed before it went.",
        STAYS
      )
    );
    expect(sendLifecycleEmailJobs).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('confirms the send once when the entry still has the decision', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 1, failed: 0, total: 1 });

    sendFromShowA();

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Acceptance email sent to Pat Owner for Rex at Show A'
      )
    );
    expect(sendLifecycleEmailJobs).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('gives the way to send it by hand when the server could not read the entry', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockRejectedValue(
      new Error('Failed to check the entry status for this email')
    );

    sendFromShowA();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The acceptance email to Pat Owner for Rex at Show A did not send. Go back to Show A and use "Email Exhibitor" on Rex\'s entry to let them know.',
        STAYS
      )
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
