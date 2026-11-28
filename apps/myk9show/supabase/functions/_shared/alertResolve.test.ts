import { describe, expect, it, vi } from 'vitest';
import {
  dedupeKeyPrefixPattern,
  liveAlertDetail,
  resolveOperatorAlertsWith,
  type AlertResolveStore,
} from './alertResolve';

const NOW = new Date('2026-11-28T15:04:05.000Z');

describe('resolveOperatorAlertsWith', () => {
  it('resolves every open match, keeps the detail and adds the note', async () => {
    const resolve = vi.fn<AlertResolveStore['resolve']>(async () => true);
    const findOpen = vi.fn<AlertResolveStore['findOpen']>(async () => [
      { id: 'a-1', detail: { html: '<p>one</p>', lifecycle: 'live' } },
      { id: 'a-2', detail: null },
    ]);

    await expect(
      resolveOperatorAlertsWith(
        { findOpen, resolve },
        {
          source: 'stripe-webhook',
          match: { dedupeKeyPrefix: 'payouts-turned-off-c1-' },
          note: 'cleared',
          now: NOW,
        }
      )
    ).resolves.toBe(2);

    expect(findOpen).toHaveBeenCalledWith('stripe-webhook', {
      dedupeKeyPrefix: 'payouts-turned-off-c1-',
    });
    expect(resolve).toHaveBeenCalledWith('a-1', '2026-11-28T15:04:05.000Z', {
      html: '<p>one</p>',
      lifecycle: 'live',
      resolution_note: 'cleared',
    });
    expect(resolve).toHaveBeenCalledWith('a-2', '2026-11-28T15:04:05.000Z', {
      resolution_note: 'cleared',
    });
  });

  it('does not count a row a person resolved in between', async () => {
    const store: AlertResolveStore = {
      findOpen: async () => [{ id: 'a-1', detail: {} }],
      resolve: async () => false,
    };
    await expect(
      resolveOperatorAlertsWith(store, {
        source: 's',
        match: { dedupeKey: 'k' },
        note: 'n',
        now: NOW,
      })
    ).resolves.toBe(0);
  });

  it('nothing open: writes nothing', async () => {
    const resolve = vi.fn<AlertResolveStore['resolve']>(async () => true);
    await expect(
      resolveOperatorAlertsWith(
        { findOpen: async () => [], resolve },
        { source: 's', match: { dedupeKey: 'k' }, note: 'n', now: NOW }
      )
    ).resolves.toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('a failed read throws for the caller to log', async () => {
    await expect(
      resolveOperatorAlertsWith(
        {
          findOpen: async () => {
            throw new Error('db down');
          },
          resolve: async () => true,
        },
        { source: 's', match: { dedupeKey: 'k' }, note: 'n', now: NOW }
      )
    ).rejects.toThrow('db down');
  });
});

describe('dedupeKeyPrefixPattern', () => {
  it('matches the prefix and escapes LIKE wildcards in it', () => {
    expect(dedupeKeyPrefixPattern('payouts-turned-off-c1-')).toBe('payouts-turned-off-c1-%');
    expect(dedupeKeyPrefixPattern('a_b%c\\d')).toBe('a\\_b\\%c\\\\d%');
  });
});

describe('liveAlertDetail', () => {
  it('marks an alert live and names what it is about', () => {
    expect(liveAlertDetail({ kind: 'refund_request', refund_request_id: 'rr-1' })).toEqual({
      lifecycle: 'live',
      live_subject: { kind: 'refund_request', refund_request_id: 'rr-1' },
    });
  });
});
