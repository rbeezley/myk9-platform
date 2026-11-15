import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SendEmail } from '../_shared/clubMoneyEmails';
import { createPayoutsDisabledDeps, notifyPayoutsTurnedOff } from './payoutsDisabledNotice';

const CLUB_ID = 'club-1';

/**
 * A fake of the three reads/writes the deps make. `club_stripe_accounts`
 * behaves like the real conditional UPDATE: it returns the row only while
 * payouts_enabled is still true, then flips it.
 */
function fakeDatabase() {
  const state = { payoutsEnabled: true };
  const accountUpdates: Array<Record<string, unknown>> = [];
  const accountFilters: Array<[string, unknown]> = [];

  const from = vi.fn((table: string) => {
    if (table === 'club_stripe_accounts') {
      const filters: Array<[string, unknown]> = [];
      let values: Record<string, unknown> = {};
      const builder = {
        update(next: Record<string, unknown>) {
          values = next;
          accountUpdates.push(next);
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          accountFilters.push([column, value]);
          return builder;
        },
        async select() {
          const matches = filters.every(([column, value]) =>
            column === 'payouts_enabled' ? state.payoutsEnabled === value : true
          );
          if (!matches) return { data: [], error: null };
          if (values.payouts_enabled === false) state.payoutsEnabled = false;
          return { data: [{ club_id: CLUB_ID }], error: null };
        },
      };
      return builder;
    }
    if (table === 'clubs') {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: { name: 'Valley KC', email: 'club@example.org' },
          error: null,
        }),
      };
      return builder;
    }
    if (table === 'user_roles') {
      const result = {
        data: [
          {
            is_active: true,
            expires_at: null,
            people: { email: 'ann@example.org', deleted_at: null, status: 'active' },
          },
          {
            is_active: true,
            expires_at: null,
            people: { email: 'bob@example.org', deleted_at: null, status: 'active' },
          },
          {
            is_active: false,
            expires_at: null,
            people: { email: 'gone@example.org', deleted_at: null, status: 'active' },
          },
        ],
        error: null,
      };
      const builder = {
        select: () => builder,
        eq: () => builder,
        then: (resolve: (value: typeof result) => unknown) => resolve(result),
      };
      return builder;
    }
    throw new Error(`unexpected table ${table}`);
  });

  return {
    client: { from } as unknown as SupabaseClient,
    state,
    accountUpdates,
    accountFilters,
  };
}

describe('notifyPayoutsTurnedOff', () => {
  it('Stripe disabling payouts emails the admins and contact address once', async () => {
    const db = fakeDatabase();
    const send = vi.fn<SendEmail>(async () => {});
    const deps = createPayoutsDisabledDeps(db.client, 'acct_test_1', send, 'https://myk9show.com');

    await expect(notifyPayoutsTurnedOff(deps, { payouts_enabled: false })).resolves.toBe(3);
    expect(send.mock.calls.map(call => call[0])).toEqual([
      'ann@example.org',
      'bob@example.org',
      'club@example.org',
    ]);
    expect(send).toHaveBeenCalledWith(
      'ann@example.org',
      "Action needed: Valley KC's bank account needs attention",
      expect.stringContaining('href="https://myk9show.com/clubs/club-1?tab=payments"')
    );
    expect(db.accountFilters).toEqual([
      ['stripe_account_id', 'acct_test_1'],
      ['payouts_enabled', true],
    ]);

    // Stripe re-delivers and sends more account.updated events while payouts stay off.
    await expect(notifyPayoutsTurnedOff(deps, { payouts_enabled: false })).resolves.toBe(0);
    await expect(notifyPayoutsTurnedOff(deps, { payouts_enabled: false })).resolves.toBe(0);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('never puts the Stripe account id in the email', async () => {
    const db = fakeDatabase();
    const send = vi.fn<SendEmail>(async () => {});
    await notifyPayoutsTurnedOff(
      createPayoutsDisabledDeps(db.client, 'acct_1TgaoXPQKr1pkcBI', send, undefined),
      { payouts_enabled: false }
    );

    for (const [, subject, html] of send.mock.calls) {
      expect(`${subject}\n${html}`).not.toMatch(/acct_/);
    }
  });

  it('payouts still enabled touches nothing and emails no one', async () => {
    const db = fakeDatabase();
    const send = vi.fn<SendEmail>(async () => {});

    await expect(
      notifyPayoutsTurnedOff(createPayoutsDisabledDeps(db.client, 'acct_x', send, undefined), {
        payouts_enabled: true,
      })
    ).resolves.toBe(0);
    expect(db.accountUpdates).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('a send failure never throws into the webhook', async () => {
    const db = fakeDatabase();
    const send = vi.fn<SendEmail>(async () => {
      throw new Error('resend down');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      notifyPayoutsTurnedOff(createPayoutsDisabledDeps(db.client, 'acct_x', send, undefined), {
        payouts_enabled: false,
      })
    ).resolves.toBe(0);
    errorSpy.mockRestore();
  });
});
