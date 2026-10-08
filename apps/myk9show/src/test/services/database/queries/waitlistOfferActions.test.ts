/**
 * MYK9-1001: withdrawing an offer goes through the secretary-authorised edge function, shows the
 * server's own reason when refused, and brings the changed row into the replica on success.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    invoke: vi.fn(),
    from: vi.fn(() => query),
    maybeSingle,
    set: vi.fn(),
    refreshEntries: vi.fn(),
  };
});

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: m.from, functions: { invoke: m.invoke } },
}));
vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/services/replication/ReplicatedWaitlistEntriesTable')
  >()),
  replicatedWaitlistEntriesTable: { set: m.set },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { refreshServerChangedEntries: m.refreshEntries },
}));

import {
  WaitlistOfferNotWithdrawnError,
  WITHDRAW_OFFER_FAILED_MESSAGE,
  withdrawWaitlistOffer,
} from '@/services/database/waitlists/offerActions';

const serverRow = {
  id: 'wl-1',
  class_id: 'class-1',
  dog_id: 'dog-1',
  exhibitor_id: 'ex-1',
  handler_id: null,
  position: 1,
  status: 'withdrawn',
  joined_via: 'online',
  offered_at: '2026-10-05T12:00:00Z',
  offer_expires_at: '2026-10-07T12:00:00Z',
  promoted_entry_id: 'entry-1',
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-05T13:00:00Z',
};

describe('withdrawWaitlistOffer (client)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls withdraw-waitlist-offer with the row id and writes the server row into the replica', async () => {
    m.invoke.mockResolvedValue({
      data: { result: 'withdrawn', status: 'withdrawn', already_closed: false, notified: true },
      error: null,
    });
    m.maybeSingle.mockResolvedValue({ data: serverRow, error: null });

    await expect(withdrawWaitlistOffer('wl-1')).resolves.toEqual({
      result: 'withdrawn',
      notified: true,
      checkoutClosed: true,
    });

    expect(m.invoke).toHaveBeenCalledWith('withdraw-waitlist-offer', {
      body: { waitlist_entry_id: 'wl-1' },
    });
    expect(m.set).toHaveBeenCalledWith(
      'wl-1',
      expect.objectContaining({ id: 'wl-1', status: 'withdrawn', promotedEntryId: 'entry-1' })
    );
    // The entry the offer created is refreshed too, so the tab's seat count frees the seat.
    expect(m.refreshEntries).toHaveBeenCalledWith(['entry-1'], {
      insert: 'if-show-loaded',
      reason: 'wait list offer entry changed by the server',
    });
  });

  it("throws the server's reason when the withdrawal is refused, and leaves the replica alone", async () => {
    const reason = 'A payment for this offer is being confirmed. Try again in a few minutes.';
    m.invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ error: reason }), { status: 409 }) },
    });

    await expect(withdrawWaitlistOffer('wl-1')).rejects.toEqual(
      new WaitlistOfferNotWithdrawnError(reason)
    );
    expect(m.set).not.toHaveBeenCalled();
  });

  it('falls back to a plain message when the failure has no reason', async () => {
    m.invoke.mockResolvedValue({ data: null, error: new Error('network down') });
    await expect(withdrawWaitlistOffer('wl-1')).rejects.toThrow(WITHDRAW_OFFER_FAILED_MESSAGE);
  });

  it('still succeeds when the replica refresh fails (the next sync settles the row)', async () => {
    m.invoke.mockResolvedValue({ data: { result: 'withdrawn', notified: true }, error: null });
    m.maybeSingle.mockResolvedValue({ data: null, error: new Error('offline') });
    await expect(withdrawWaitlistOffer('wl-1')).resolves.toEqual({
      result: 'withdrawn',
      notified: true,
      checkoutClosed: true,
    });
    expect(m.set).not.toHaveBeenCalled();
  });

  it('reports a withdrawal whose exhibitor notice did not send as withdrawn, not notified', async () => {
    m.invoke.mockResolvedValue({ data: { result: 'withdrawn', notified: false }, error: null });
    m.maybeSingle.mockResolvedValue({ data: serverRow, error: null });
    await expect(withdrawWaitlistOffer('wl-1')).resolves.toEqual({
      result: 'withdrawn',
      notified: false,
      checkoutClosed: true,
    });
    expect(m.set).toHaveBeenCalled();
  });

  // Codex P2 on #2772: the server's result is carried through, never collapsed to a boolean.
  it('carries an expired (lapsed) result through with its notified flag', async () => {
    m.invoke.mockResolvedValue({
      data: { result: 'expired', status: 'expired', already_closed: true, notified: true },
      error: null,
    });
    m.maybeSingle.mockResolvedValue({ data: serverRow, error: null });
    await expect(withdrawWaitlistOffer('wl-1')).resolves.toEqual({
      result: 'expired',
      notified: true,
      checkoutClosed: true,
    });
  });

  it('carries an already-closed result through, never as a failed notice', async () => {
    m.invoke.mockResolvedValue({
      data: { result: 'already_closed', status: 'declined', already_closed: true, notified: false },
      error: null,
    });
    m.maybeSingle.mockResolvedValue({ data: serverRow, error: null });
    await expect(withdrawWaitlistOffer('wl-1')).resolves.toEqual({
      result: 'already_closed',
      status: 'declined',
    });
  });

  it.each([
    ['paid', 409],
    ['not_found', 404],
  ] as const)(
    'returns the %s result the server refuses with, without touching the replica',
    async (result, status) => {
      m.invoke.mockResolvedValue({
        data: null,
        error: {
          context: new Response(JSON.stringify({ result, error: 'refused' }), { status }),
        },
      });
      await expect(withdrawWaitlistOffer('wl-1')).resolves.toEqual({ result });
      expect(m.set).not.toHaveBeenCalled();
    }
  );

  it('treats a 200 with no recognised result as a failure, not a success', async () => {
    m.invoke.mockResolvedValue({ data: { status: 'withdrawn' }, error: null });
    await expect(withdrawWaitlistOffer('wl-1')).rejects.toThrow(WITHDRAW_OFFER_FAILED_MESSAGE);
  });

  it('carries a checkout page the server could not close through as checkoutClosed: false', async () => {
    m.invoke.mockResolvedValue({
      data: { result: 'withdrawn', notified: true, checkout_closed: false },
      error: null,
    });
    m.maybeSingle.mockResolvedValue({ data: serverRow, error: null });
    await expect(withdrawWaitlistOffer('wl-1')).resolves.toEqual({
      result: 'withdrawn',
      notified: true,
      checkoutClosed: false,
    });
  });
});
