import { describe, expect, it } from 'vitest';
import { stripeTransferDashboardUrl } from './stripeDashboardUrl';

describe('stripeTransferDashboardUrl', () => {
  it('builds a Stripe connect transfer dashboard URL, encoding the id', () => {
    expect(stripeTransferDashboardUrl('tr_123')).toBe(
      'https://dashboard.stripe.com/connect/transfers/tr_123'
    );
  });

  it('encodes special characters in the transfer id', () => {
    expect(stripeTransferDashboardUrl('tr/weird id')).toBe(
      'https://dashboard.stripe.com/connect/transfers/tr%2Fweird%20id'
    );
  });
});
