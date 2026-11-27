// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  buildAlertRow,
  runAlertAdmin,
  type AlertRowOptions,
  type AlertDeliveryOptions,
} from '../_shared/alertAdminCore';
import { findExpiredOffers, runMonitoredWaitlistCron } from './cronOutcome';

function setup() {
  const client = {
    captureCheckIn: vi.fn(() => 'check-in-1'),
    flush: vi.fn(async () => true),
  };
  const alert = vi
    .fn<
      (
        subject: string,
        html: string,
        options: AlertRowOptions & AlertDeliveryOptions
      ) => Promise<void>
    >()
    .mockResolvedValue(undefined);
  const logger = { warn: vi.fn(), error: vi.fn() };
  const now = () => new Date('2026-09-02T12:00:00Z');
  return { client, alert, logger, now };
}

function pagedClient(pages: Array<{ data: unknown[] | null; error?: { message: string } }>) {
  const range = vi.fn(async () => {
    const page = pages[range.mock.calls.length - 1] ?? { data: [] };
    return { data: page.data, error: page.error ?? null };
  });
  const chain = { eq: vi.fn(), lt: vi.fn(), order: vi.fn(), range, select: vi.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.lt.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, range };
}

const offerRows = (count: number, start = 0) =>
  Array.from({ length: count }, (_, i) => ({ id: `offer-${start + i}` }));

describe('findExpiredOffers paging', () => {
  it('reads every page until a short page and returns all rows in order', async () => {
    const { client, range } = pagedClient([
      { data: offerRows(1000) },
      { data: offerRows(1000, 1000) },
      { data: offerRows(5, 2000) },
    ]);
    const errors: string[] = [];
    const offers = await findExpiredOffers(client, '2026-09-02T12:00:00.000Z', errors);
    expect(offers).toHaveLength(2005);
    expect(offers[1000]).toMatchObject({ id: 'offer-1000' });
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(errors).toEqual([]);
  });

  it('asks for one more page after an exactly full page and stops on the empty one', async () => {
    const { client, range } = pagedClient([{ data: offerRows(1000) }, { data: [] }]);
    const offers = await findExpiredOffers(client, '2026-09-02T12:00:00.000Z', []);
    expect(offers).toHaveLength(1000);
    expect(range).toHaveBeenCalledTimes(2);
  });

  it('keeps earlier pages and records the error when a later page fails', async () => {
    const { client } = pagedClient([
      { data: offerRows(1000) },
      { data: null, error: { message: 'boom' } },
    ]);
    const errors: string[] = [];
    const offers = await findExpiredOffers(client, '2026-09-02T12:00:00.000Z', errors);
    expect(offers).toHaveLength(1000);
    expect(errors).toEqual(['Fetch expired: boom']);
  });
});

describe('waitlist cron outcomes', () => {
  it('reports a failed expired-offer query as HTTP 500, error check-in, and operator alert', async () => {
    const deps = setup();
    const errors: string[] = [];
    const range = vi.fn(async () => ({ data: null, error: { message: 'database unavailable' } }));
    const order2 = vi.fn(() => ({ range }));
    const order1 = vi.fn(() => ({ order: order2 }));
    const lt = vi.fn(() => ({ order: order1 }));
    const eq = vi.fn(() => ({ lt }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const response = await runMonitoredWaitlistCron({
      ...deps,
      work: async () => {
        const offers = await findExpiredOffers(
          { from } as unknown as Pick<SupabaseClient, 'from'>,
          deps.now().toISOString(),
          errors
        );
        expect(offers).toEqual([]);
        return { expiredOffers: 0, errors, notificationErrors: [] };
      },
    });
    expect(from).toHaveBeenCalledWith('waitlist_entries');
    expect(eq).toHaveBeenCalledWith('status', 'offered');
    expect(lt).toHaveBeenCalledWith('offer_expires_at', '2026-09-02T12:00:00.000Z');
    expect(order1).toHaveBeenCalledWith('offer_expires_at', { ascending: true });
    expect(order2).toHaveBeenCalledWith('id', { ascending: true });
    expect(range).toHaveBeenCalledWith(0, 999);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      success: false,
      results: { errors: ['Fetch expired: database unavailable'] },
    });
    expect(deps.client.captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error', checkInId: 'check-in-1' })
    );
    expect(deps.alert).toHaveBeenCalledWith(
      'Waitlist expiration cron failed',
      expect.any(String),
      expect.objectContaining({
        source: 'cron-waitlist-expiration',
        dedupeKey: 'waitlist-expiration:2026-09-02T12:00:00.000Z',
        skipEmailOnDuplicate: true,
        detail: { errors: ['Fetch expired: database unavailable'] },
      })
    );
  });

  it.each([{ notificationErrors: [] }, { notificationErrors: ['Email provider 503'] }])(
    'keeps successful state work successful with notification errors %j',
    async ({ notificationErrors }) => {
      const deps = setup();
      const response = await runMonitoredWaitlistCron({
        ...deps,
        work: async () => ({ expiredOffers: 1, newOffers: 1, errors: [], notificationErrors }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        success: true,
        results: { expiredOffers: 1, newOffers: 1, notificationErrors },
      });
      expect(deps.alert).not.toHaveBeenCalled();
      expect(deps.client.captureCheckIn).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'ok' })
      );
    }
  );

  it('does not skip work when check-ins fail or monitoring is unconfigured', async () => {
    const deps = setup();
    deps.client.captureCheckIn.mockImplementation(() => {
      throw new Error('Sentry down');
    });
    const work = vi.fn(async () => ({ errors: [] }));
    expect((await runMonitoredWaitlistCron({ ...deps, work })).status).toBe(200);
    expect((await runMonitoredWaitlistCron({ ...deps, client: null, work })).status).toBe(200);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('preserves thrown job failures when the alert itself fails', async () => {
    const deps = setup();
    deps.alert.mockRejectedValue(new Error('alert unavailable'));
    const response = await runMonitoredWaitlistCron({
      ...deps,
      headers: { 'Access-Control-Allow-Origin': 'https://myk9show.com' },
      work: async () => {
        throw new Error('job failed');
      },
    });
    expect(response.status).toBe(500);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://myk9show.com');
    expect(await response.json()).toEqual({ success: false, error: 'job failed' });
    expect(deps.client.captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error' })
    );
  });

  it('uses the same dedupe key within a scheduler window and a new key next window', async () => {
    const deps = setup();
    const work = async () => ({ errors: ['state failure'] });
    for (const time of ['12:00:00', '12:14:59', '12:15:00']) {
      await runMonitoredWaitlistCron({ ...deps, work, now: () => new Date(`2026-09-02T${time}Z`) });
    }
    const keys = deps.alert.mock.calls.map(call => call[2].dedupeKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('sends only one alert email per window through the actual alert orchestration', async () => {
    const deps = setup();
    const storedKeys = new Set<string>();
    const sendEmail = vi.fn(async () => {});
    deps.alert.mockImplementation(async (subject, html, options) => {
      await runAlertAdmin(subject, {
        skipEmailOnDuplicate: options.skipEmailOnDuplicate,
        insert: async () => {
          const row = buildAlertRow(subject, html, options);
          const key = `${row.source}:${row.dedupe_key}`;
          if (storedKeys.has(key)) return { error: { code: '23505', message: 'duplicate' } };
          storedKeys.add(key);
          return { error: null };
        },
        sendEmail,
      });
    });
    for (const time of ['12:00:00', '12:14:59', '12:15:00']) {
      await runMonitoredWaitlistCron({
        ...deps,
        work: async () => ({ errors: ['lookup failed'] }),
        now: () => new Date(`2026-09-02T${time}Z`),
      });
    }
    expect(storedKeys.size).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
