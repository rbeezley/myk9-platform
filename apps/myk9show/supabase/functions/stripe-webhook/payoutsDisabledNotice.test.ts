import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SendEmail } from '../_shared/clubMoneyEmails';
import {
  createPayoutsDisabledDeps,
  notifyPayoutsTurnedOff,
  ALERT_SHOW_LIMIT,
  OPERATOR_ALERT_TIMEOUT_MS,
  type OperatorAlert,
} from './payoutsDisabledNotice';

const CLUB_ID = 'club-1';

interface FakeShow {
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  deleted_at: string | null;
}

const SHOWS: FakeShow[] = [
  {
    name: 'Spring Trial',
    start_date: '2026-12-05',
    end_date: '2026-12-06',
    status: 'published',
    deleted_at: null,
  },
  {
    name: 'Draft Trial',
    start_date: '2027-01-09',
    end_date: '2027-01-09',
    status: 'draft',
    deleted_at: null,
  },
  {
    name: 'Ringside Today',
    start_date: '2026-11-18',
    end_date: '2026-11-18',
    status: 'in_progress',
    deleted_at: null,
  },
  {
    name: 'Deleted Trial',
    start_date: '2026-12-12',
    end_date: '2026-12-12',
    status: 'upcoming',
    deleted_at: '2026-11-01T00:00:00Z',
  },
];

function operator(alert: OperatorAlert = vi.fn<OperatorAlert>(async () => {})) {
  return { alert, eventId: 'evt_1', livemode: true };
}

/**
 * A fake of the three reads/writes the deps make. `club_stripe_accounts`
 * behaves like the real conditional UPDATE: it returns the row only while
 * payouts_enabled is still true, then flips it.
 */
function fakeDatabase(options: { showsFail?: boolean; shows?: FakeShow[] } = {}) {
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
    if (table === 'shows') {
      const filters: Array<(row: FakeShow) => boolean> = [];
      let rowLimit = Infinity;
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          if (column !== 'club_id') filters.push(row => row[column as keyof FakeShow] === value);
          return builder;
        },
        in(column: keyof FakeShow, values: unknown[]) {
          filters.push(row => values.includes(row[column]));
          return builder;
        },
        is(column: keyof FakeShow, value: unknown) {
          filters.push(row => row[column] === value);
          return builder;
        },
        order: () => builder,
        limit(count: number) {
          rowLimit = count;
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) =>
          resolve(
            options.showsFail
              ? { data: null, error: { message: 'shows read failed' } }
              : {
                  data: (options.shows ?? SHOWS)
                    .filter(row => filters.every(keep => keep(row)))
                    .sort((a, b) => a.start_date.localeCompare(b.start_date))
                    .slice(0, rowLimit)
                    .map(({ name, start_date, end_date }) => ({ name, start_date, end_date })),
                  error: null,
                }
          ),
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
    const deps = createPayoutsDisabledDeps(
      db.client,
      'acct_test_1',
      send,
      'https://myk9show.com',
      operator()
    );

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
      createPayoutsDisabledDeps(db.client, 'acct_1TgaoXPQKr1pkcBI', send, undefined, operator()),
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
      notifyPayoutsTurnedOff(
        createPayoutsDisabledDeps(db.client, 'acct_x', send, undefined, operator()),
        {
          payouts_enabled: true,
        }
      )
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
      notifyPayoutsTurnedOff(
        createPayoutsDisabledDeps(db.client, 'acct_x', send, undefined, operator()),
        {
          payouts_enabled: false,
        }
      )
    ).resolves.toBe(0);
    errorSpy.mockRestore();
  });
});

describe('operator alert when Stripe turns payouts off', () => {
  it('raises one alert naming the club and its public shows, and nothing on a repeat', async () => {
    const db = fakeDatabase();
    const send = vi.fn<SendEmail>(async () => {});
    const alert = vi.fn<OperatorAlert>(async () => {});
    const deps = createPayoutsDisabledDeps(
      db.client,
      'acct_test_1',
      send,
      'https://myk9show.com',
      operator(alert)
    );

    await notifyPayoutsTurnedOff(deps, { payouts_enabled: false });

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      'Stripe turned off payouts for Valley KC',
      expect.stringContaining('<code>acct_test_1</code>'),
      { source: 'stripe-webhook', severity: 'warn', dedupeKey: 'payouts-turned-off-club-1-evt_1' }
    );
    const html = alert.mock.calls[0][1];
    expect(html).toContain('live mode');
    expect(html).toContain('Spring Trial, 2026-12-05 to 2026-12-06');
    expect(html).toContain('Ringside Today, 2026-11-18');
    expect(html).not.toContain('Draft Trial');
    expect(html).not.toContain('Deleted Trial');
    expect(html).toContain('href="https://myk9show.com/clubs/club-1?tab=payments"');
    // The alert makes no claim about the club email: the mail sender logs a failed send and
    // does not report it, so nothing here knows whether the club was told.
    expect(html).toContain('This alert does not confirm that the club was notified.');
    expect(html).not.toContain('were emailed');
    expect(html).not.toMatch(/\u2014/);

    // A re-delivered or later account.updated with payouts still off claims nothing.
    await notifyPayoutsTurnedOff(deps, { payouts_enabled: false });
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('payouts turning back on raises nothing', async () => {
    const db = fakeDatabase();
    const alert = vi.fn<OperatorAlert>(async () => {});
    await notifyPayoutsTurnedOff(
      createPayoutsDisabledDeps(
        db.client,
        'acct_x',
        vi.fn<SendEmail>(async () => {}),
        undefined,
        operator(alert)
      ),
      { payouts_enabled: true }
    );
    expect(alert).not.toHaveBeenCalled();
  });

  it('still alerts without the show list when the shows lookup fails', async () => {
    const db = fakeDatabase({ showsFail: true });
    const alert = vi.fn<OperatorAlert>(async () => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await notifyPayoutsTurnedOff(
      createPayoutsDisabledDeps(
        db.client,
        'acct_x',
        vi.fn<SendEmail>(async () => {}),
        undefined,
        operator(alert)
      ),
      { payouts_enabled: false }
    );

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][1]).toContain("could not load this club's shows");
    errorSpy.mockRestore();
  });

  it('a failing alert still sends the club email and never throws into the webhook', async () => {
    const db = fakeDatabase();
    const send = vi.fn<SendEmail>(async () => {});
    const alert = vi.fn<OperatorAlert>(async () => {
      throw new Error('operator_alerts down');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      notifyPayoutsTurnedOff(
        createPayoutsDisabledDeps(db.client, 'acct_x', send, undefined, operator(alert)),
        { payouts_enabled: false }
      )
    ).resolves.toBe(3);
    expect(send).toHaveBeenCalledTimes(3);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(db.state.payoutsEnabled).toBe(false);
    errorSpy.mockRestore();
  });

  it('a failing club email still raises the alert', async () => {
    const db = fakeDatabase();
    const alert = vi.fn<OperatorAlert>(async () => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await notifyPayoutsTurnedOff(
      createPayoutsDisabledDeps(
        db.client,
        'acct_x',
        vi.fn<SendEmail>(async () => {
          throw new Error('resend down');
        }),
        undefined,
        operator(alert)
      ),
      { payouts_enabled: false }
    );
    expect(alert).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('lists at most ALERT_SHOW_LIMIT shows and says there are more', async () => {
    const many: FakeShow[] = Array.from({ length: ALERT_SHOW_LIMIT + 5 }, (_, index) => ({
      name: `Trial ${String(index + 1).padStart(2, '0')}`,
      start_date: `2027-01-${String(index + 1).padStart(2, '0')}`,
      end_date: `2027-01-${String(index + 1).padStart(2, '0')}`,
      status: 'published',
      deleted_at: null,
    }));
    const db = fakeDatabase({ shows: many });
    const alert = vi.fn<OperatorAlert>(async () => {});

    await notifyPayoutsTurnedOff(
      createPayoutsDisabledDeps(
        db.client,
        'acct_x',
        vi.fn<SendEmail>(async () => {}),
        undefined,
        operator(alert)
      ),
      { payouts_enabled: false }
    );

    const html = alert.mock.calls[0][1];
    expect(html.match(/<li>/g)).toHaveLength(ALERT_SHOW_LIMIT);
    expect(html).toContain(`Trial ${ALERT_SHOW_LIMIT}, `);
    expect(html).not.toContain(`Trial ${ALERT_SHOW_LIMIT + 1}, `);
    expect(html).toContain('And more: see the club page.');
  });

  it('exactly ALERT_SHOW_LIMIT shows lists them all with no "and more"', async () => {
    const exact: FakeShow[] = Array.from({ length: ALERT_SHOW_LIMIT }, (_, index) => ({
      name: `Trial ${index + 1}`,
      start_date: '2027-02-01',
      end_date: '2027-02-01',
      status: 'upcoming',
      deleted_at: null,
    }));
    const alert = vi.fn<OperatorAlert>(async () => {});
    await notifyPayoutsTurnedOff(
      createPayoutsDisabledDeps(
        fakeDatabase({ shows: exact }).client,
        'acct_x',
        vi.fn<SendEmail>(async () => {}),
        undefined,
        operator(alert)
      ),
      { payouts_enabled: false }
    );

    const html = alert.mock.calls[0][1];
    expect(html.match(/<li>/g)).toHaveLength(ALERT_SHOW_LIMIT);
    expect(html).not.toContain('And more');
  });

  it('an alert that never settles is abandoned after the bound, and the club email still went', async () => {
    vi.useFakeTimers();
    try {
      const db = fakeDatabase();
      const send = vi.fn<SendEmail>(async () => {});
      const alert = vi.fn<OperatorAlert>(() => new Promise<void>(() => {}));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let settled = false;
      const run = notifyPayoutsTurnedOff(
        createPayoutsDisabledDeps(db.client, 'acct_x', send, undefined, operator(alert)),
        { payouts_enabled: false }
      ).then(sent => {
        settled = true;
        return sent;
      });

      await vi.advanceTimersByTimeAsync(OPERATOR_ALERT_TIMEOUT_MS - 1);
      expect(alert).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(run).resolves.toBe(3);
      expect(send).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledWith(
        `Payouts-turned-off operator alert for club club-1 gave up after ${OPERATOR_ALERT_TIMEOUT_MS}ms`
      );
      expect(vi.getTimerCount()).toBe(0);
      errorSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
