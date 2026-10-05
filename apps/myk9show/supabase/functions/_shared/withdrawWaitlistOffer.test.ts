// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  WITHDRAW_MESSAGES,
  withdrawWaitlistOffer,
  type WithdrawableOffer,
  type WithdrawWaitlistOfferDeps,
} from './withdrawWaitlistOffer';

const NOW = '2026-10-05T15:00:00.000Z';

const openOffer = (over: Partial<WithdrawableOffer> = {}): WithdrawableOffer => ({
  id: 'wl-1',
  status: 'offered',
  promoted_entry_id: 'entry-1',
  offer_expires_at: '2026-10-07T15:00:00.000Z',
  show_id: 'show-1',
  club_id: 'club-1',
  ...over,
});

function deps(over: Partial<WithdrawWaitlistOfferDeps> = {}): WithdrawWaitlistOfferDeps {
  return {
    loadOffer: vi.fn().mockResolvedValue(openOffer()),
    canManageShow: vi.fn().mockResolvedValue(true),
    recheckOpenOffer: vi.fn().mockResolvedValue({ id: 'wl-1', promoted_entry_id: 'entry-1' }),
    expire: vi.fn().mockResolvedValue('expired'),
    ...over,
  };
}

describe('withdrawWaitlistOffer', () => {
  it('closes an open offer through the shared expiry with the terminal status withdrawn', async () => {
    const d = deps();
    const result = await withdrawWaitlistOffer(d, 'wl-1', NOW);

    expect(d.canManageShow).toHaveBeenCalledWith('show-1', 'club-1');
    expect(d.recheckOpenOffer).toHaveBeenCalledWith('wl-1', NOW);
    expect(d.expire).toHaveBeenCalledWith(
      { id: 'wl-1', promoted_entry_id: 'entry-1' },
      'withdrawn'
    );
    expect(result).toEqual({
      httpStatus: 200,
      body: { status: 'withdrawn', already_closed: false },
    });
  });

  it('answers an outsider exactly as a missing offer, and touches nothing', async () => {
    const outsider = deps({ canManageShow: vi.fn().mockResolvedValue(false) });
    const missing = deps({ loadOffer: vi.fn().mockResolvedValue(null) });

    const a = await withdrawWaitlistOffer(outsider, 'wl-1', NOW);
    const b = await withdrawWaitlistOffer(missing, 'wl-1', NOW);

    expect(a).toEqual({ httpStatus: 404, body: { error: WITHDRAW_MESSAGES.notFound } });
    expect(b).toEqual(a);
    expect(outsider.expire).not.toHaveBeenCalled();
    expect(missing.canManageShow).not.toHaveBeenCalled();
  });

  it.each(['withdrawn', 'declined', 'expired'])(
    'treats an already %s offer as a calm idempotent result',
    async status => {
      const d = deps({ loadOffer: vi.fn().mockResolvedValue(openOffer({ status })) });
      const result = await withdrawWaitlistOffer(d, 'wl-1', NOW);
      expect(result).toEqual({ httpStatus: 200, body: { status, already_closed: true } });
      expect(d.expire).not.toHaveBeenCalled();
    }
  );

  it('refuses a paid (accepted) offer and a row that was never offered', async () => {
    const paid = await withdrawWaitlistOffer(
      deps({ loadOffer: vi.fn().mockResolvedValue(openOffer({ status: 'accepted' })) }),
      'wl-1',
      NOW
    );
    const waiting = await withdrawWaitlistOffer(
      deps({ loadOffer: vi.fn().mockResolvedValue(openOffer({ status: 'waiting' })) }),
      'wl-1',
      NOW
    );
    expect(paid).toEqual({ httpStatus: 409, body: { error: WITHDRAW_MESSAGES.paid } });
    expect(waiting).toEqual({ httpStatus: 409, body: { error: WITHDRAW_MESSAGES.notOffered } });
  });

  it('closes a lapsed offer as expired, not withdrawn', async () => {
    const d = deps({
      loadOffer: vi
        .fn()
        .mockResolvedValue(openOffer({ offer_expires_at: '2026-10-05T14:00:00.000Z' })),
    });
    const result = await withdrawWaitlistOffer(d, 'wl-1', NOW);
    expect(d.expire).toHaveBeenCalledWith(expect.objectContaining({ id: 'wl-1' }), 'expired');
    expect(result).toEqual({ httpStatus: 200, body: { status: 'expired', already_closed: true } });
  });

  it('fails closed when Stripe shows the offer paid or the expiry errors', async () => {
    const paid = await withdrawWaitlistOffer(
      deps({ expire: vi.fn().mockResolvedValue('paid') }),
      'wl-1',
      NOW
    );
    const failed = await withdrawWaitlistOffer(
      deps({ expire: vi.fn().mockResolvedValue('error') }),
      'wl-1',
      NOW
    );
    expect(paid).toEqual({ httpStatus: 409, body: { error: WITHDRAW_MESSAGES.reconciling } });
    expect(failed).toEqual({ httpStatus: 500, body: { error: WITHDRAW_MESSAGES.failed } });
  });

  it('does not overwrite an offer that a payment closed between the two reads', async () => {
    const loadOffer = vi
      .fn()
      .mockResolvedValueOnce(openOffer())
      .mockResolvedValueOnce(openOffer({ status: 'accepted' }));
    const d = deps({ loadOffer, recheckOpenOffer: vi.fn().mockResolvedValue(null) });
    const result = await withdrawWaitlistOffer(d, 'wl-1', NOW);
    expect(d.expire).not.toHaveBeenCalled();
    expect(result).toEqual({ httpStatus: 409, body: { error: WITHDRAW_MESSAGES.paid } });
  });

  it('reports a failed read as a failure, never as not found', async () => {
    const result = await withdrawWaitlistOffer(
      deps({ loadOffer: vi.fn().mockResolvedValue('error') }),
      'wl-1',
      NOW
    );
    expect(result).toEqual({ httpStatus: 500, body: { error: WITHDRAW_MESSAGES.failed } });
  });
});
