import { describe, expect, it, vi } from 'vitest';
import { forgetStaleStripeCustomer } from './staleStripeCustomer';

describe('forgetStaleStripeCustomer', () => {
  it('answers true once the stale row is deleted', async () => {
    const logError = vi.fn();
    const deleteRow = vi.fn(async () => ({ error: null }));
    expect(await forgetStaleStripeCustomer('cus_old', deleteRow, logError)).toBe(true);
    expect(deleteRow).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it('answers false and logs when the delete fails, so no replacement customer is created', async () => {
    const logError = vi.fn();
    const error = { message: 'connection reset', code: '08006' };
    expect(await forgetStaleStripeCustomer('cus_old', async () => ({ error }), logError)).toBe(
      false
    );
    expect(logError).toHaveBeenCalledWith(
      'Could not delete stale Stripe customer row cus_old; not creating a replacement:',
      error
    );
  });
});
