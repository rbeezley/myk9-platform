import { describe, expect, it, vi } from 'vitest';
import {
  cartHasBlockedClass,
  newLineClassIds,
  releasePriorSessionForClassGate,
} from './cartClassGate';

function sessionsApi(status: string | null | 'missing' | 'unreachable', expireFails = false) {
  return {
    retrieve: vi.fn(async (id: string) => {
      if (status === 'missing')
        throw Object.assign(new Error('gone'), { code: 'resource_missing' });
      if (status === 'unreachable') throw new Error('network');
      return { id, status };
    }),
    expire: vi.fn(async () => {
      if (expireFails) throw new Error('expire failed');
    }),
  };
}

describe('retiring a linked Checkout Session before the class gate refuses (Codex P1, PR #2438)', () => {
  it('releases a cart with no linked session without calling Stripe', async () => {
    const api = sessionsApi('open');
    expect(await releasePriorSessionForClassGate(null, api)).toEqual({ kind: 'released' });
    expect(api.retrieve).not.toHaveBeenCalled();
  });

  it('expires an open session before releasing, so the old page cannot pay', async () => {
    const api = sessionsApi('open');
    expect(await releasePriorSessionForClassGate('cs_1', api)).toEqual({ kind: 'released' });
    expect(api.expire).toHaveBeenCalledWith('cs_1');
  });

  it('keeps the link when the session is already paid: the webhook settles it', async () => {
    const api = sessionsApi('complete');
    const result = await releasePriorSessionForClassGate('cs_1', api);
    expect(result).toMatchObject({ kind: 'blocked', status: 409 });
    expect(api.expire).not.toHaveBeenCalled();
  });

  it('releases an expired or missing session', async () => {
    expect(await releasePriorSessionForClassGate('cs_1', sessionsApi('expired'))).toEqual({
      kind: 'released',
    });
    expect(await releasePriorSessionForClassGate('cs_1', sessionsApi('missing'))).toEqual({
      kind: 'released',
    });
  });

  it('keeps the link when Stripe cannot confirm the page is dead', async () => {
    expect(await releasePriorSessionForClassGate('cs_1', sessionsApi('unreachable'))).toMatchObject(
      { kind: 'blocked', status: 503 }
    );
    expect(await releasePriorSessionForClassGate('cs_1', sessionsApi('open', true))).toMatchObject({
      kind: 'blocked',
      status: 503,
    });
  });
});

describe('stripe-checkout class gate (MYK9-656)', () => {
  const availability = [
    { class_id: 'class-cancelled', self_service_block: 'cancelled' },
    { class_id: 'class-full', self_service_block: 'full' },
    { class_id: 'class-open', self_service_block: null },
  ];

  it('refuses a cart with a new line in a closed or full class', () => {
    expect(
      cartHasBlockedClass(
        [{ class_id: 'class-open' }, { class_id: 'class-cancelled', entry_id: null }],
        availability
      )
    ).toBe(true);
    expect(cartHasBlockedClass([{ class_id: 'class-full' }], availability)).toBe(true);
  });

  it('lets a cart through when every new line is in an open class', () => {
    expect(cartHasBlockedClass([{ class_id: 'class-open' }], availability)).toBe(false);
  });

  it('never blocks a Finish Payment line, which settles an entry that already exists', () => {
    expect(
      cartHasBlockedClass([{ class_id: 'class-cancelled', entry_id: 'entry-1' }], availability)
    ).toBe(false);
    expect(newLineClassIds([{ class_id: 'class-cancelled', entry_id: 'entry-1' }])).toEqual([]);
  });

  it('asks about each new line class once', () => {
    expect(
      newLineClassIds([
        { class_id: 'class-open' },
        { class_id: 'class-open' },
        { class_id: 'class-full', entry_id: null },
      ])
    ).toEqual(['class-open', 'class-full']);
  });
});
