import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOperatorAlertsWith, type AlertMatch } from '../_shared/alertResolve';
import { notifyPayoutsTurnedOff, type PayoutsDisabledDeps } from './payoutsDisabledNotice';
import {
  createPayoutsReturnedDeps,
  payoutsReturnedNote,
  resolvePayoutsReturned,
  type PayoutsReturnedDeps,
} from './payoutsReturnedNotice';

const NOW = new Date('2026-11-23T20:56:00.000Z');
const CLUB_A = '11111111-1111-4111-8111-111111111111';
const CLUB_B = '22222222-2222-4222-8222-222222222222';

interface StoredAlert {
  id: string;
  source: string;
  dedupe_key: string;
  detail: Record<string, unknown>;
  resolved_at: string | null;
}

/**
 * One in-memory world: each club's club_stripe_accounts row, and the
 * operator_alerts table. Both notices run against it with the real dedupe
 * keys and the real resolve helper.
 */
function world() {
  const payoutsEnabled = new Map<string, boolean>([
    [CLUB_A, true],
    [CLUB_B, true],
  ]);
  const alerts: StoredAlert[] = [];

  function flip(clubId: string, to: boolean): string[] {
    if (payoutsEnabled.get(clubId) === to) return [];
    payoutsEnabled.set(clubId, to);
    return [clubId];
  }

  const resolveAlerts = (source: string, match: AlertMatch, note: string) =>
    resolveOperatorAlertsWith(
      {
        findOpen: async (src, m) =>
          alerts
            .filter(a => a.source === src && a.resolved_at === null)
            .filter(a =>
              'dedupeKey' in m
                ? a.dedupe_key === m.dedupeKey
                : a.dedupe_key.startsWith(m.dedupeKeyPrefix)
            )
            .map(a => ({ id: a.id, detail: a.detail })),
        resolve: async (id, resolvedAt, detail) => {
          const row = alerts.find(a => a.id === id && a.resolved_at === null);
          if (!row) return false;
          row.resolved_at = resolvedAt;
          row.detail = detail;
          return true;
        },
      },
      { source, match, note, now: NOW }
    );

  function offDeps(clubId: string, eventId: string): PayoutsDisabledDeps {
    return {
      claimPayoutsTurnedOff: async () => flip(clubId, false),
      loadClub: async () => ({ name: `Club ${clubId.slice(0, 1)}`, email: null }),
      loadRecipients: async () => [],
      loadPublicShows: async () => [],
      send: async () => {},
      siteUrl: 'https://myk9show.com',
      stripeAccountId: `acct_${clubId.slice(0, 1)}`,
      operator: {
        eventId,
        livemode: false,
        alert: async (_subject, _html, opts) => {
          alerts.push({
            id: `alert-${alerts.length + 1}`,
            source: opts.source,
            dedupe_key: opts.dedupeKey,
            detail: opts.detail,
            resolved_at: null,
          });
        },
      },
    };
  }

  function onDeps(clubId: string): PayoutsReturnedDeps {
    return {
      claimPayoutsTurnedOn: async () => flip(clubId, true),
      resolveAlerts,
      now: () => NOW,
    };
  }

  return { alerts, offDeps, onDeps };
}

describe('resolvePayoutsReturned', () => {
  it('payouts off then on: the club alert is resolved with a note saying when', async () => {
    const w = world();
    await notifyPayoutsTurnedOff(w.offDeps(CLUB_A, 'evt_off'), { payouts_enabled: false });
    expect(w.alerts).toHaveLength(1);
    expect(w.alerts[0].resolved_at).toBeNull();
    expect(w.alerts[0].detail.lifecycle).toBe('live');

    await expect(resolvePayoutsReturned(w.onDeps(CLUB_A), { payouts_enabled: true })).resolves.toBe(
      1
    );

    expect(w.alerts[0].resolved_at).toBe('2026-11-23T20:56:00.000Z');
    expect(w.alerts[0].detail.resolution_note).toBe(
      'Payouts returned: Stripe reported payouts enabled again at 2026-11-23T20:56:00.000Z.'
    );
    // The alert's own detail survives the resolve.
    expect(w.alerts[0].detail.live_subject).toEqual({ kind: 'club_payments', club_id: CLUB_A });
  });

  it('every open off alert for the club closes, from more than one episode', async () => {
    const w = world();
    await notifyPayoutsTurnedOff(w.offDeps(CLUB_A, 'evt_1'), { payouts_enabled: false });
    // An earlier episode's alert still open (e.g. raised before this fix).
    w.alerts.push({
      id: 'stale',
      source: 'stripe-webhook',
      dedupe_key: `payouts-turned-off-${CLUB_A}-evt_0`,
      detail: {},
      resolved_at: null,
    });
    await expect(resolvePayoutsReturned(w.onDeps(CLUB_A), { payouts_enabled: true })).resolves.toBe(
      2
    );
    expect(w.alerts.every(a => a.resolved_at !== null)).toBe(true);
  });

  it('payouts on with no open alert does nothing', async () => {
    const w = world();
    const deps = w.onDeps(CLUB_A);
    const resolveAlerts = vi.fn(deps.resolveAlerts);
    // Already on: no transition to claim, nothing resolved.
    await expect(
      resolvePayoutsReturned({ ...deps, resolveAlerts }, { payouts_enabled: true })
    ).resolves.toBe(0);
    expect(resolveAlerts).not.toHaveBeenCalled();
    expect(w.alerts).toEqual([]);
  });

  it("a second club's alert is untouched", async () => {
    const w = world();
    await notifyPayoutsTurnedOff(w.offDeps(CLUB_A, 'evt_a'), { payouts_enabled: false });
    await notifyPayoutsTurnedOff(w.offDeps(CLUB_B, 'evt_b'), { payouts_enabled: false });

    await resolvePayoutsReturned(w.onDeps(CLUB_A), { payouts_enabled: true });

    const [alertA, alertB] = w.alerts;
    expect(alertA.dedupe_key).toBe(`payouts-turned-off-${CLUB_A}-evt_a`);
    expect(alertA.resolved_at).not.toBeNull();
    expect(alertB.dedupe_key).toBe(`payouts-turned-off-${CLUB_B}-evt_b`);
    expect(alertB.resolved_at).toBeNull();
  });

  it('a redelivered payouts-on event resolves nothing more', async () => {
    const w = world();
    await notifyPayoutsTurnedOff(w.offDeps(CLUB_A, 'evt_off'), { payouts_enabled: false });
    await resolvePayoutsReturned(w.onDeps(CLUB_A), { payouts_enabled: true });
    await expect(resolvePayoutsReturned(w.onDeps(CLUB_A), { payouts_enabled: true })).resolves.toBe(
      0
    );
  });

  it('payouts still off: claims nothing', async () => {
    const claimPayoutsTurnedOn = vi.fn(async () => [CLUB_A]);
    const resolveAlerts = vi.fn(async () => 1);
    await expect(
      resolvePayoutsReturned(
        { claimPayoutsTurnedOn, resolveAlerts, now: () => NOW },
        { payouts_enabled: false }
      )
    ).resolves.toBe(0);
    expect(claimPayoutsTurnedOn).not.toHaveBeenCalled();
    expect(resolveAlerts).not.toHaveBeenCalled();
  });

  it('never throws: a failed claim or resolve is logged', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      resolvePayoutsReturned(
        {
          claimPayoutsTurnedOn: async () => {
            throw new Error('db down');
          },
          resolveAlerts: async () => 1,
          now: () => NOW,
        },
        { payouts_enabled: true }
      )
    ).resolves.toBe(0);
    await expect(
      resolvePayoutsReturned(
        {
          claimPayoutsTurnedOn: async () => [CLUB_A],
          resolveAlerts: async () => {
            throw new Error('db down');
          },
          now: () => NOW,
        },
        { payouts_enabled: true }
      )
    ).resolves.toBe(0);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it('payoutsReturnedNote names the time', () => {
    expect(payoutsReturnedNote(NOW)).toBe(
      'Payouts returned: Stripe reported payouts enabled again at 2026-11-23T20:56:00.000Z.'
    );
  });
});

describe('createPayoutsReturnedDeps', () => {
  it('claims only a row that is still off, for this Stripe account', async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const builder = {
      update(values: unknown) {
        calls.push(['update', values]);
        return builder;
      },
      eq(column: string, value: unknown) {
        calls.push(['eq', column, value]);
        return builder;
      },
      async select(columns: string) {
        calls.push(['select', columns]);
        return { data: [{ club_id: CLUB_A }], error: null };
      },
    };
    const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
    const deps = createPayoutsReturnedDeps(client, 'acct_1', async () => 0);

    await expect(deps.claimPayoutsTurnedOn()).resolves.toEqual([CLUB_A]);
    expect(client.from).toHaveBeenCalledWith('club_stripe_accounts');
    expect(calls).toEqual([
      ['update', { payouts_enabled: true }],
      ['eq', 'stripe_account_id', 'acct_1'],
      ['eq', 'payouts_enabled', false],
      ['select', 'club_id'],
    ]);
  });

  it('a failed claim reads as no transition', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const builder = {
      update: () => builder,
      eq: () => builder,
      select: async () => ({ data: null, error: { message: 'boom' } }),
    };
    const client = { from: () => builder } as unknown as SupabaseClient;
    await expect(
      createPayoutsReturnedDeps(client, 'acct_1', async () => 0).claimPayoutsTurnedOn()
    ).resolves.toEqual([]);
    errorSpy.mockRestore();
  });
});
