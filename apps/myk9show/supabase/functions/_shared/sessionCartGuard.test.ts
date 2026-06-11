import { describe, it, expect } from 'vitest';
import { sessionMatchesCart } from './sessionCartGuard';

// Codex round-3 P1: start checkout, abandon the Stripe tab, mutate the cart,
// then pay the OLD Stripe page. The webhook must refuse to build entries from
// the mutated cart against the stale charge.

describe('sessionMatchesCart', () => {
  const current = {
    sessionId: 'cs_live_current',
    sessionAmountTotal: 6180,
    cartSessionId: 'cs_live_current',
    cartTotalCents: 6180,
    cartItemCount: 2,
  };

  it('accepts the cart’s current session with matching amount', () => {
    expect(sessionMatchesCart(current)).toEqual({ ok: true });
  });

  it('rejects a session the cart no longer points at (cart mutated after checkout)', () => {
    const result = sessionMatchesCart({ ...current, cartSessionId: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not the cart's current session/i);
  });

  it('rejects a superseded session (cart points at a newer one)', () => {
    const result = sessionMatchesCart({ ...current, cartSessionId: 'cs_live_newer' });
    expect(result.ok).toBe(false);
  });

  it('rejects an amount mismatch even when the session id matches', () => {
    const result = sessionMatchesCart({ ...current, cartTotalCents: 9000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/amount/i);
  });

  it('tolerates a missing session amount (2020-03-02 payloads lack amount_total)', () => {
    expect(sessionMatchesCart({ ...current, sessionAmountTotal: null })).toEqual({ ok: true });
    expect(sessionMatchesCart({ ...current, sessionAmountTotal: undefined })).toEqual({
      ok: true,
    });
  });

  it('tolerates a cart with no stored total (legacy rows) when ids match', () => {
    expect(sessionMatchesCart({ ...current, cartTotalCents: null })).toEqual({ ok: true });
  });

  // Codex round-4 P1: "Clear Cart" empties the items; paying the abandoned
  // session would otherwise claim the empty cart, create ZERO entries for a
  // real charge, and dodge the amount check (old payloads omit amount_total).
  it('rejects a paid session for an empty cart regardless of id/amount match', () => {
    const result = sessionMatchesCart({ ...current, cartItemCount: 0, cartTotalCents: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/empty/i);
  });
});
