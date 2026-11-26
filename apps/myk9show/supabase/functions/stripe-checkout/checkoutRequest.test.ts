import { describe, expect, it } from 'vitest';
import { parseCheckoutBody } from './checkoutRequest';

describe('parseCheckoutBody', () => {
  it('accepts a JSON object and returns it for field validation', () => {
    const body = { mode: 'entry', cart_id: 'cart-1', success_url: 'a', cancel_url: 'b' };
    expect(parseCheckoutBody(JSON.stringify(body))).toEqual({ ok: true, value: body });
  });

  it.each(['', '{not json', 'null', '[]', '"entry"', '42'])('rejects %j as invalid JSON', raw => {
    expect(parseCheckoutBody(raw)).toEqual({ ok: false, error: 'Invalid JSON body' });
  });
});
