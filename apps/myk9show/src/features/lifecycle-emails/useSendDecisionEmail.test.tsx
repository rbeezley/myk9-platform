import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** A notice the secretary must act on stays until she closes it (MYK9-1915). */
const STAYS = { duration: Infinity };

/** The page she is on when the Undo window closes. */
function onPage(path: string) {
  window.history.pushState({}, '', path);
}

function sender(onSettled = vi.fn()) {
  return renderHook(() => useSendDecisionEmail({ onSettled })).result.current;
}

afterEach(() => {
  onPage('/');
});

describe('useSendDecisionEmail after a show switch (MYK9-1833, MYK9-1915)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveDecisionEmailJob).mockResolvedValue('job-1');
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 1, failed: 0, total: 1 });
    onPage('/shows/show-a/entries');
  });

  it('writes the email with the show the decision was made on, not the show now on screen', async () => {
    const send = sender();
    onPage('/shows/show-b/entries');

    send([showAEntry], 'accepted', 'Show A');

    await waitFor(() =>
      expect(sendLifecycleEmailJobs).toHaveBeenCalledWith(
        expect.objectContaining({ showId: 'show-a', jobIds: ['job-1'] })
      )
    );
    const draft = vi.mocked(saveDecisionEmailJob).mock.calls[0]?.[2];
    expect(vi.mocked(saveDecisionEmailJob).mock.calls[0]?.[0]).toEqual([showAEntry]);
    expect(draft?.body).toContain('Show A');
  });

  it('names the show after the deciding page has unmounted and another show is on screen', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 0, failed: 1, total: 1 });
    const deciding = renderHook(() => useSendDecisionEmail({ onSettled: vi.fn() }));
    const send = deciding.result.current;
    deciding.unmount();
    onPage('/shows/show-b/entries');
    renderHook(() => useSendDecisionEmail({ onSettled: vi.fn() }));

    send([showAEntry], 'accepted', 'Show A');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The acceptance email to Pat Owner for Rex at Show A did not send. Go back to Show A and use "Email Exhibitor" on Rex\'s entry to let them know.',
        STAYS
      )
    );
  });

  it('judges where she is when the notice shows, not when the send began', async () => {
    let finishSend: (value: { sent: number; failed: number; total: number }) => void = () => {};
    vi.mocked(sendLifecycleEmailJobs).mockReturnValue(
      new Promise(resolve => {
        finishSend = resolve;
      })
    );
    sender()([showAEntry], 'accepted', 'Show A');
    await waitFor(() => expect(sendLifecycleEmailJobs).toHaveBeenCalled());

    onPage('/shows/show-b/entries');
    finishSend({ sent: 1, failed: 0, total: 1 });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Acceptance email sent to Pat Owner for Rex at Show A'
      )
    );
  });

  it('names the show when she has left for a page that belongs to no show', async () => {
    onPage('/dogs');
    sender()([showAEntry], 'accepted', 'Show A');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Acceptance email sent to Pat Owner for Rex at Show A'
      )
    );
  });

  it('keeps the success notice short while she is still on that show, on any of its pages', async () => {
    onPage('/at-show/show-a/class/class-1');
    sender()([showAEntry], 'accepted', 'Show A');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Acceptance email sent to Pat Owner for Rex')
    );
  });

  it('counts a page that names the show in its query as the same show', async () => {
    onPage('/secretary/messages?showId=show-a');
    sender()([showAEntry], 'accepted', 'Show A');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Acceptance email sent to Pat Owner for Rex')
    );
  });

  it('keeps the failure advice short on the same show, and the notice stays', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 0, failed: 1, total: 1 });
    sender()([showAEntry], 'waitlisted', 'Show A');
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The waitlist email to Pat Owner for Rex did not send. Use "Email Exhibitor" on Rex\'s entry to let them know.',
        STAYS
      )
    );
  });

  it('names the dog and show when offline after a switch, says to go back, and stays', () => {
    onPage('/shows/show-b');
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      sender()([showAEntry], 'accepted', 'Show A');
      expect(toast.error).toHaveBeenCalledWith(
        'You\'re offline, so the acceptance email to Pat Owner for Rex at Show A was not sent. When you are back online, go back to Show A and use "Email Exhibitor" on Rex\'s entry.',
        STAYS
      );
      expect(saveDecisionEmailJob).not.toHaveBeenCalled();
    } finally {
      online.mockRestore();
    }
  });

  it('names the dog and show when the exhibitor has no email, after a switch, and stays', () => {
    onPage('/shows/show-b');
    sender()([{ ...showAEntry, ownerEmail: '' }], 'accepted', 'Show A');
    expect(toast.info).toHaveBeenCalledWith(
      'Pat Owner has no email on file, so no acceptance email was sent for Rex at Show A.',
      STAYS
    );
  });

  it('leaves the show out when the decided-on show has no name', async () => {
    onPage('/shows/show-b');
    sender()([showAEntry], 'accepted', 'this show');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Acceptance email sent to Pat Owner for Rex')
    );
  });

  it('refreshes the lifecycle email caches of the show the decision was made on', async () => {
    const onSettled = vi.fn();
    onPage('/shows/show-b');
    sender(onSettled)([showAEntry], 'accepted', 'Show A');
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith('show-a'));
  });
});

describe('useSendDecisionEmail for several classes of one entry form (MYK9-1800)', () => {
  const rexNovice = { ...showAEntry, id: 'entry-3', classes: [{ name: 'Novice A' }] };
  const rexOpen = { ...showAEntry, id: 'entry-1', classes: [{ name: 'Open B' }] };
  const bessMaster = {
    ...showAEntry,
    id: 'entry-2',
    dogName: 'Bess',
    classes: [{ name: 'Master C' }],
  };
  const several = [rexNovice, rexOpen, bessMaster] as unknown as EntryManagementEntry[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveDecisionEmailJob).mockResolvedValue('job-1');
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 1, failed: 0, total: 1 });
    onPage('/shows/show-a/entries');
  });

  it('saves and sends ONE job whose email lists every class, and names each dog once', async () => {
    sender()(several, 'accepted', 'Show A');

    await waitFor(() => expect(sendLifecycleEmailJobs).toHaveBeenCalledTimes(1));
    expect(saveDecisionEmailJob).toHaveBeenCalledTimes(1);
    const [savedEntries, stepType, draft] = vi.mocked(saveDecisionEmailJob).mock.calls[0] ?? [];
    expect(savedEntries?.map(entry => entry.id)).toEqual(['entry-1', 'entry-2', 'entry-3']);
    expect(stepType).toBe('accepted');
    expect(draft?.body).toContain('Open B');
    expect(draft?.body).toContain('Master C');
    expect(draft?.body).toContain('Novice A');
    expect(toast.success).toHaveBeenCalledWith(
      'Acceptance email sent to Pat Owner for Rex and Bess'
    );
  });

  it('tells her where to email from when it fails, naming the entry form', async () => {
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 0, failed: 1, total: 1 });
    sender()([rexNovice, rexOpen] as unknown as EntryManagementEntry[], 'waitlisted', 'Show A');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        `The waitlist email to Pat Owner for Rex did not send. Use "Email Exhibitor" on Rex's entry form to let them know.`,
        STAYS
      )
    );
  });
});
