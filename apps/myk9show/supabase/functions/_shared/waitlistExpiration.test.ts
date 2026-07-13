import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WAITLIST_PAYMENT_DEADLINE_HOURS,
  expireWaitlistOffer,
  shouldAbortPaymentLinkExpiration,
  resolveWaitlistPaymentDeadlineHours,
  type WaitlistExpirationStripe,
  type WaitlistExpirationSupabase,
} from './waitlistExpiration';

interface MockResult {
  data: unknown;
  error: { message: string } | null;
}

interface MockCall {
  table: string;
  action: 'select' | 'update' | null;
  select: string | null;
  update: Record<string, unknown> | null;
  filters: Array<[string, unknown]>;
  overlaps: Array<[string, unknown[]]>;
  maybeSingle: boolean;
}

function createSupabaseMock(results: MockResult[]): {
  supabase: WaitlistExpirationSupabase;
  calls: MockCall[];
} {
  const calls: MockCall[] = [];
  const queue = [...results];

  const supabase = {
    from(table: string) {
      const call: MockCall = {
        table,
        action: null,
        select: null,
        update: null,
        filters: [],
        overlaps: [],
        maybeSingle: false,
      };
      calls.push(call);

      const chain = {
        select(columns: string) {
          call.action = call.action ?? 'select';
          call.select = columns;
          return chain;
        },
        update(values: Record<string, unknown>) {
          call.action = 'update';
          call.update = values;
          return chain;
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value]);
          return chain;
        },
        overlaps(column: string, value: unknown[]) {
          call.overlaps.push([column, value]);
          return chain;
        },
        maybeSingle() {
          call.maybeSingle = true;
          return Promise.resolve(queue.shift() ?? { data: null, error: null });
        },
        then<TResult1 = MockResult, TResult2 = never>(
          onfulfilled?: ((value: MockResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ): PromiseLike<TResult1 | TResult2> {
          return Promise.resolve(queue.shift() ?? { data: null, error: null }).then(
            onfulfilled,
            onrejected
          );
        },
      };

      return chain;
    },
  } as unknown as WaitlistExpirationSupabase;

  return { supabase, calls };
}

function createStripeMock(session: {
  status: string | null;
  payment_status: string | null;
}): WaitlistExpirationStripe & {
  checkout: {
    sessions: {
      retrieve: ReturnType<typeof vi.fn>;
      expire: ReturnType<typeof vi.fn>;
    };
  };
} {
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue(session),
        expire: vi.fn().mockResolvedValue({}),
      },
    },
  };
}

describe('resolveWaitlistPaymentDeadlineHours', () => {
  it('uses the show-level waitlist payment deadline when it is a positive number', () => {
    expect(resolveWaitlistPaymentDeadlineHours(72)).toBe(72);
    expect(resolveWaitlistPaymentDeadlineHours('12')).toBe(12);
  });

  it('falls back to the configured default for missing or unsafe values', () => {
    expect(resolveWaitlistPaymentDeadlineHours(null)).toBe(DEFAULT_WAITLIST_PAYMENT_DEADLINE_HOURS);
    expect(resolveWaitlistPaymentDeadlineHours(0)).toBe(DEFAULT_WAITLIST_PAYMENT_DEADLINE_HOURS);
    expect(resolveWaitlistPaymentDeadlineHours(-1)).toBe(DEFAULT_WAITLIST_PAYMENT_DEADLINE_HOURS);
    expect(resolveWaitlistPaymentDeadlineHours('nope')).toBe(
      DEFAULT_WAITLIST_PAYMENT_DEADLINE_HOURS
    );
  });
});

describe('shouldAbortPaymentLinkExpiration', () => {
  it('aborts only when Stripe says the payment is paid', () => {
    expect(shouldAbortPaymentLinkExpiration({ status: 'complete', paymentStatus: 'paid' })).toBe(
      true
    );
    expect(shouldAbortPaymentLinkExpiration({ status: 'open', paymentStatus: 'paid' })).toBe(true);
    expect(
      shouldAbortPaymentLinkExpiration({ status: 'complete', paymentStatus: 'unpaid' })
    ).toBe(false);
  });

  it('allows open or already-expired unpaid sessions to be closed locally', () => {
    expect(shouldAbortPaymentLinkExpiration({ status: 'open', paymentStatus: 'unpaid' })).toBe(
      false
    );
    expect(shouldAbortPaymentLinkExpiration({ status: 'expired', paymentStatus: 'unpaid' })).toBe(
      false
    );
  });
});

describe('expireWaitlistOffer', () => {
  it('fails closed before changing an offer when an open Checkout Session cannot be verified', async () => {
    const { supabase, calls } = createSupabaseMock([
      { data: null, error: { message: 'database unavailable' } },
    ]);
    const stripe = createStripeMock({ status: 'open', payment_status: 'unpaid' });

    const result = await expireWaitlistOffer({
      supabase,
      stripe,
      offer: { id: 'wl-1', promoted_entry_id: 'entry-1' },
      nowIso: '2026-06-21T12:00:00.000Z',
    });

    expect(result).toBe('error');
    expect(calls).toHaveLength(1);
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
  });

  it('can preserve a user-declined terminal state while using the shared Stripe expiry sequence', async () => {
    const { supabase, calls } = createSupabaseMock([
      { data: [], error: null },
      { data: [{ id: 'entry-1' }], error: null },
      { data: null, error: null },
    ]);
    const stripe = createStripeMock({ status: 'open', payment_status: 'unpaid' });

    const result = await expireWaitlistOffer({
      supabase,
      stripe,
      offer: { id: 'wl-1', promoted_entry_id: 'entry-1' },
      nowIso: '2026-06-21T12:00:00.000Z',
      terminalStatus: 'declined',
    });

    expect(result).toBe('expired');
    expect(calls.at(-1)).toMatchObject({
      table: 'waitlist_entries',
      update: { status: 'declined', updated_at: '2026-06-21T12:00:00.000Z' },
    });
  });

  it('expires the Stripe link, promoted entry, and waitlist offer in order', async () => {
    const { supabase, calls } = createSupabaseMock([
      { data: [{ id: 'link-1', stripe_checkout_session_id: 'cs_1' }], error: null },
      { data: null, error: null },
      { data: [{ id: 'entry-1' }], error: null },
      { data: null, error: null },
    ]);
    const stripe = createStripeMock({ status: 'open', payment_status: 'unpaid' });

    const result = await expireWaitlistOffer({
      supabase,
      stripe,
      offer: { id: 'wl-1', promoted_entry_id: 'entry-1' },
      nowIso: '2026-06-21T12:00:00.000Z',
    });

    expect(result).toBe('expired');
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_1');
    expect(calls.map(call => [call.table, call.action, call.update])).toEqual([
      ['entry_payment_links', 'select', null],
      [
        'entry_payment_links',
        'update',
        { status: 'expired', updated_at: '2026-06-21T12:00:00.000Z' },
      ],
      ['entries', 'update', { entry_status: 'promotion-expired' }],
      ['waitlist_entries', 'update', { status: 'expired', updated_at: '2026-06-21T12:00:00.000Z' }],
    ]);
  });

  it('does not expire the entry or waitlist row when Stripe says the session is paid', async () => {
    const { supabase, calls } = createSupabaseMock([
      { data: [{ id: 'link-1', stripe_checkout_session_id: 'cs_paid' }], error: null },
    ]);
    const stripe = createStripeMock({ status: 'complete', payment_status: 'paid' });

    const result = await expireWaitlistOffer({
      supabase,
      stripe,
      offer: { id: 'wl-1', promoted_entry_id: 'entry-1' },
      nowIso: '2026-06-21T12:00:00.000Z',
    });

    expect(result).toBe('paid');
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it('expires the app-side link and releases the offer when Stripe completed without payment', async () => {
    const { supabase, calls } = createSupabaseMock([
      { data: [{ id: 'link-1', stripe_checkout_session_id: 'cs_failed_async' }], error: null },
      { data: null, error: null },
      { data: [{ id: 'entry-1' }], error: null },
      { data: null, error: null },
    ]);
    const stripe = createStripeMock({ status: 'complete', payment_status: 'unpaid' });

    const result = await expireWaitlistOffer({
      supabase,
      stripe,
      offer: { id: 'wl-1', promoted_entry_id: 'entry-1' },
      nowIso: '2026-06-21T12:00:00.000Z',
    });

    expect(result).toBe('expired');
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(calls.map(call => [call.table, call.action, call.update])).toEqual([
      ['entry_payment_links', 'select', null],
      [
        'entry_payment_links',
        'update',
        { status: 'expired', updated_at: '2026-06-21T12:00:00.000Z' },
      ],
      ['entries', 'update', { entry_status: 'promotion-expired' }],
      ['waitlist_entries', 'update', { status: 'expired', updated_at: '2026-06-21T12:00:00.000Z' }],
    ]);
  });
});
