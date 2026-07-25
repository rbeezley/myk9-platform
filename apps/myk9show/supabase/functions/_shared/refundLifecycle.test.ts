import { describe, expect, it, vi } from 'vitest';
import { listAllChargeRefunds, resolveRefundLedgerAction } from './refundLifecycle';

describe('resolveRefundLedgerAction', () => {
  it.each([
    ['pending', 'defer'],
    ['requires_action', 'defer'],
    ['succeeded', 'book'],
    ['failed', 'fail'],
    ['canceled', 'cancel'],
    [null, 'defer'],
    ['unknown', 'defer'],
  ] as const)('maps Stripe status %s to %s', (status, expected) => {
    expect(resolveRefundLedgerAction(status)).toBe(expected);
  });
});

describe('listAllChargeRefunds', () => {
  it('drains every page using the final refund id as starting_after', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: 're_1' }, { id: 're_2' }],
        has_more: true,
      })
      .mockResolvedValueOnce({ data: [{ id: 're_3' }], has_more: false });

    await expect(listAllChargeRefunds('ch_1', listPage, 2)).resolves.toEqual([
      { id: 're_1' },
      { id: 're_2' },
      { id: 're_3' },
    ]);
    expect(listPage).toHaveBeenNthCalledWith(1, { charge: 'ch_1', limit: 2 });
    expect(listPage).toHaveBeenNthCalledWith(2, {
      charge: 'ch_1',
      limit: 2,
      starting_after: 're_2',
    });
  });

  it('stops after one exact-size page when has_more is false', async () => {
    const listPage = vi.fn().mockResolvedValue({
      data: [{ id: 're_1' }, { id: 're_2' }],
      has_more: false,
    });

    await expect(listAllChargeRefunds('ch_1', listPage, 2)).resolves.toHaveLength(2);
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it('propagates Stripe list failures so the webhook can fail closed and alert', async () => {
    const listPage = vi.fn().mockRejectedValue(new Error('stripe unavailable'));

    await expect(listAllChargeRefunds('ch_1', listPage)).rejects.toThrow('stripe unavailable');
  });

  it('rejects an empty page that claims more rows instead of looping forever', async () => {
    const listPage = vi.fn().mockResolvedValue({ data: [], has_more: true });

    await expect(listAllChargeRefunds('ch_1', listPage)).rejects.toThrow(
      'reported has_more with an empty page'
    );
    expect(listPage).toHaveBeenCalledTimes(1);
  });
});
