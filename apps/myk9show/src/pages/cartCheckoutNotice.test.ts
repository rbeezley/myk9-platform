import { describe, it, expect } from 'vitest';
import { CHECKOUT_RETURN_PARAM, readCheckoutReturnStatus } from './cartCheckoutNotice';

describe('readCheckoutReturnStatus', () => {
  it('returns "cancelled" for the exact ?checkout=cancelled contract', () => {
    const params = new URLSearchParams('?checkout=cancelled');
    expect(readCheckoutReturnStatus(params)).toBe('cancelled');
  });

  it('uses the shared param name constant', () => {
    const params = new URLSearchParams();
    params.set(CHECKOUT_RETURN_PARAM, 'cancelled');
    expect(readCheckoutReturnStatus(params)).toBe('cancelled');
  });

  it('returns null when the param is absent', () => {
    const params = new URLSearchParams('?showId=show-1');
    expect(readCheckoutReturnStatus(params)).toBeNull();
  });

  it('returns null for an empty query string', () => {
    expect(readCheckoutReturnStatus(new URLSearchParams())).toBeNull();
  });

  it('does not treat the success return as a cancellation', () => {
    const params = new URLSearchParams('?checkout=success');
    expect(readCheckoutReturnStatus(params)).toBeNull();
  });

  it('is case-sensitive — only the lowercase contract matches', () => {
    const params = new URLSearchParams('?checkout=Cancelled');
    expect(readCheckoutReturnStatus(params)).toBeNull();
  });
});
