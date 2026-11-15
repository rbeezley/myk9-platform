import { describe, expect, it } from 'vitest';
import { findRunOutOffers, type RunOutOfferEntry } from '..';

/** A replica row carries its deadline too; the rule must not read it. */
type Row = RunOutOfferEntry & { offerExpiresAt?: string };

const row = (over: Partial<Row> & { id: string }): Row => ({
  classId: 'class-1',
  status: 'waiting',
  ...over,
});

const ids = (rows: readonly RunOutOfferEntry[]) => findRunOutOffers(rows).rows.map(r => r.id);

describe('findRunOutOffers (MYK9-1988)', () => {
  const expired = row({ id: 'expired-1', status: 'expired', offeredAt: '2026-10-01T12:00:00Z' });

  it('counts an expired offer whose spot nobody has been offered since', () => {
    const list = findRunOutOffers([expired, row({ id: 'waiting-1' })]);
    expect(list.rows.map(r => r.id)).toEqual(['expired-1']);
    expect(list.count).toBe(list.rows.length);
  });

  it.each(['offered', 'accepted', 'expired', 'declined', 'withdrawn'])(
    'stops counting once its spot was offered to another dog, whose offer is now %s',
    status => {
      const refill = row({
        id: 'refill',
        status,
        offeredAt: '2026-10-03T12:00:00Z',
        replacesOfferId: 'expired-1',
      });
      // A refill that ran out itself counts on its own: its spot needs a new offer.
      expect(ids([expired, refill])).toEqual(status === 'expired' ? ['refill'] : []);
    }
  );

  it('two expired offers in one class with one new offer still count one', () => {
    const second = row({ id: 'expired-2', status: 'expired', offeredAt: '2026-10-02T12:00:00Z' });
    const refill = row({
      id: 'refill',
      status: 'offered',
      offeredAt: '2026-10-04T12:00:00Z',
      replacesOfferId: 'expired-1',
    });
    const list = findRunOutOffers([expired, second, refill]);
    expect(list.count).toBe(1);
    expect(list.rows.map(r => r.id)).toEqual(['expired-2']);
  });

  it('a later offer that refills nothing hides no expired offer', () => {
    const otherSpot = row({
      id: 'other-spot',
      status: 'offered',
      offeredAt: '2026-10-05T12:00:00Z',
    });
    expect(ids([expired, otherSpot])).toEqual(['expired-1']);
  });

  it('orders by when the offer was made, not by its deadline', () => {
    // Made second but with the shorter window, so its deadline came first.
    const shortWindow = row({
      id: 'a-short-window',
      status: 'expired',
      offeredAt: '2026-10-02T12:00:00Z',
      offerExpiresAt: '2026-10-03T12:00:00Z',
    });
    const longWindow = row({
      id: 'b-long-window',
      status: 'expired',
      offeredAt: '2026-10-01T12:00:00Z',
      offerExpiresAt: '2026-10-04T12:00:00Z',
    });
    expect(ids([shortWindow, longWindow])).toEqual(['b-long-window', 'a-short-window']);
  });

  it('ignores rows that were never an offer that ran out', () => {
    expect(
      findRunOutOffers([
        row({ id: 'waiting' }),
        row({ id: 'open', status: 'offered' }),
        row({ id: 'declined', status: 'declined' }),
        row({ id: 'withdrawn', status: 'withdrawn' }),
        row({ id: 'accepted', status: 'accepted' }),
      ])
    ).toEqual({ count: 0, rows: [] });
  });
});
