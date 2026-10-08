// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  WITHDRAW_MESSAGES,
  withdrawWaitlistOffer,
  type DatabaseWithdrawal,
  type WithdrawableOffer,
  type WithdrawWaitlistOfferDeps,
} from './withdrawWaitlistOffer';

const openOffer = (over: Partial<WithdrawableOffer> = {}): WithdrawableOffer => ({
  id: 'wl-1',
  status: 'offered',
  promoted_entry_id: 'entry-1',
  show_id: 'show-1',
  club_id: 'club-1',
  ...over,
});

const withdrawn: DatabaseWithdrawal = {
  result: 'withdrawn',
  status: 'withdrawn',
  notified: true,
  event_id: 'event-1',
  event_type: 'withdrawn',
};

function deps(over: Partial<WithdrawWaitlistOfferDeps> = {}): WithdrawWaitlistOfferDeps {
  return {
    loadOffer: vi.fn().mockResolvedValue(openOffer()),
    canManageShow: vi.fn().mockResolvedValue(true),
    closePaymentPages: vi.fn().mockResolvedValue('expired'),
    withdrawInDatabase: vi.fn().mockResolvedValue(withdrawn),
    dispatchEvent: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('withdrawWaitlistOffer', () => {
  it('withdraws in the database FIRST, then closes the checkout pages, then hands off the event', async () => {
    const order: string[] = [];
    const d = deps({
      closePaymentPages: vi.fn(async () => {
        order.push('stripe');
        return 'expired' as const;
      }),
      withdrawInDatabase: vi.fn(async () => {
        order.push('database');
        return withdrawn;
      }),
      dispatchEvent: vi.fn(async () => {
        order.push('dispatch');
      }),
    });

    const result = await withdrawWaitlistOffer(d, 'wl-1');

    expect(order).toEqual(['database', 'stripe', 'dispatch']);
    expect(d.canManageShow).toHaveBeenCalledWith('show-1', 'club-1');
    expect(d.closePaymentPages).toHaveBeenCalledWith('entry-1');
    expect(d.withdrawInDatabase).toHaveBeenCalledWith('wl-1');
    expect(d.dispatchEvent).toHaveBeenCalledWith({
      eventId: 'event-1',
      eventType: 'withdrawn',
      waitlistEntryId: 'wl-1',
    });
    expect(result).toEqual({
      httpStatus: 200,
      body: {
        result: 'withdrawn',
        status: 'withdrawn',
        already_closed: false,
        notified: true,
        checkout_closed: true,
      },
    });
  });

  // Database first: a checkout that could not be closed never undoes the withdrawal. A payment
  // on it finds an inactive entry, which stripe-webhook sends to the refund queue.
  it.each(['paid', 'error'] as const)(
    'keeps the withdrawal and says the checkout is still open when Stripe answers %s',
    async pages => {
      const d = deps({ closePaymentPages: vi.fn().mockResolvedValue(pages) });
      const result = await withdrawWaitlistOffer(d, 'wl-1');
      expect(result).toEqual({
        httpStatus: 200,
        body: {
          result: 'withdrawn',
          status: 'withdrawn',
          already_closed: false,
          notified: true,
          checkout_closed: false,
        },
      });
      expect(d.withdrawInDatabase).toHaveBeenCalled();
    }
  );

  it.each([
    ['already closed', { result: 'already_closed', status: 'withdrawn', notified: false }],
    ['paid', { result: 'paid', status: 'offered', notified: false }],
    ['not found', { result: 'not_found', status: null, notified: false }],
    ['a failed call', 'error'],
  ] as const)('does not touch Stripe when the database answers %s', async (_label, answer) => {
    const d = deps({ withdrawInDatabase: vi.fn().mockResolvedValue(answer) });
    await withdrawWaitlistOffer(d, 'wl-1');
    expect(d.closePaymentPages).not.toHaveBeenCalled();
    expect(d.dispatchEvent).not.toHaveBeenCalled();
  });

  // `notified` is the database's answer about the transition it made, never a guess here.
  it.each([true, false])(
    'reports notified=%s exactly as the database returned it',
    async notified => {
      const d = deps({ withdrawInDatabase: vi.fn().mockResolvedValue({ ...withdrawn, notified }) });
      const result = await withdrawWaitlistOffer(d, 'wl-1');
      expect(result.body.notified).toBe(notified);
    }
  );

  it('reports a concurrent withdrawal the database found already closed, with nothing sent', async () => {
    const d = deps({
      withdrawInDatabase: vi.fn().mockResolvedValue({
        result: 'already_closed',
        status: 'withdrawn',
        notified: false,
      }),
    });
    expect(await withdrawWaitlistOffer(d, 'wl-1')).toEqual({
      httpStatus: 200,
      body: {
        result: 'already_closed',
        status: 'withdrawn',
        already_closed: true,
        notified: false,
      },
    });
    expect(d.dispatchEvent).not.toHaveBeenCalled();
  });

  it('closes a lapsed offer as the database decides (expired) and hands off its expiry event', async () => {
    const d = deps({
      withdrawInDatabase: vi.fn().mockResolvedValue({
        result: 'expired',
        status: 'expired',
        notified: true,
        event_id: 'event-2',
        event_type: 'expired',
      }),
    });
    expect(await withdrawWaitlistOffer(d, 'wl-1')).toEqual({
      httpStatus: 200,
      body: {
        result: 'expired',
        status: 'expired',
        already_closed: true,
        notified: true,
        checkout_closed: true,
      },
    });
    expect(d.dispatchEvent).toHaveBeenCalledWith({
      eventId: 'event-2',
      eventType: 'expired',
      waitlistEntryId: 'wl-1',
    });
  });

  it('keeps the withdrawal when the email/push hand-off fails (the cron retries it)', async () => {
    const d = deps({ dispatchEvent: vi.fn().mockRejectedValue(new Error('timeout')) });
    expect(await withdrawWaitlistOffer(d, 'wl-1')).toEqual({
      httpStatus: 200,
      body: {
        result: 'withdrawn',
        status: 'withdrawn',
        already_closed: false,
        notified: true,
        checkout_closed: true,
      },
    });
  });

  it('maps the database refusals and failures', async () => {
    const paid = await withdrawWaitlistOffer(
      deps({
        withdrawInDatabase: vi
          .fn()
          .mockResolvedValue({ result: 'paid', status: 'offered', notified: false }),
      }),
      'wl-1'
    );
    const failed = await withdrawWaitlistOffer(
      deps({ withdrawInDatabase: vi.fn().mockResolvedValue('error') }),
      'wl-1'
    );
    expect(paid).toEqual({
      httpStatus: 409,
      body: { result: 'paid', error: WITHDRAW_MESSAGES.paid },
    });
    expect(failed).toEqual({ httpStatus: 500, body: { error: WITHDRAW_MESSAGES.failed } });
  });

  it('answers an outsider exactly as a missing offer, and touches nothing', async () => {
    const outsider = deps({ canManageShow: vi.fn().mockResolvedValue(false) });
    const missing = deps({ loadOffer: vi.fn().mockResolvedValue(null) });

    const a = await withdrawWaitlistOffer(outsider, 'wl-1');
    const b = await withdrawWaitlistOffer(missing, 'wl-1');

    expect(a).toEqual({
      httpStatus: 404,
      body: { result: 'not_found', error: WITHDRAW_MESSAGES.notFound },
    });
    expect(b).toEqual(a);
    for (const d of [outsider, missing]) {
      expect(d.closePaymentPages).not.toHaveBeenCalled();
      expect(d.withdrawInDatabase).not.toHaveBeenCalled();
    }
  });

  it.each(['withdrawn', 'declined', 'expired'])(
    'answers an already %s offer calmly without touching Stripe or the database',
    async status => {
      const d = deps({ loadOffer: vi.fn().mockResolvedValue(openOffer({ status })) });
      expect(await withdrawWaitlistOffer(d, 'wl-1')).toEqual({
        httpStatus: 200,
        body: { result: 'already_closed', status, already_closed: true, notified: false },
      });
      expect(d.closePaymentPages).not.toHaveBeenCalled();
      expect(d.withdrawInDatabase).not.toHaveBeenCalled();
    }
  );

  it('refuses a paid (accepted) offer and a row that was never offered', async () => {
    const paid = await withdrawWaitlistOffer(
      deps({ loadOffer: vi.fn().mockResolvedValue(openOffer({ status: 'accepted' })) }),
      'wl-1'
    );
    const waiting = await withdrawWaitlistOffer(
      deps({ loadOffer: vi.fn().mockResolvedValue(openOffer({ status: 'waiting' })) }),
      'wl-1'
    );
    expect(paid).toEqual({
      httpStatus: 409,
      body: { result: 'paid', error: WITHDRAW_MESSAGES.paid },
    });
    expect(waiting).toEqual({ httpStatus: 409, body: { error: WITHDRAW_MESSAGES.notOffered } });
  });

  it('reports a failed read as a failure, never as not found', async () => {
    const result = await withdrawWaitlistOffer(
      deps({ loadOffer: vi.fn().mockResolvedValue('error') }),
      'wl-1'
    );
    expect(result).toEqual({ httpStatus: 500, body: { error: WITHDRAW_MESSAGES.failed } });
  });
});
