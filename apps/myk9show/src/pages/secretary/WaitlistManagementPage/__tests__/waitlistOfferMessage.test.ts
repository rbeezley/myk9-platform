import { describe, it, expect } from 'vitest';
import { buildWaitlistOfferMessage } from '../waitlistOfferMessage';

describe('buildWaitlistOfferMessage', () => {
  it('includes dog and class when both are known', () => {
    expect(buildWaitlistOfferMessage({ dogName: 'Rex', className: 'Novice A' })).toBe(
      'A waitlist spot in Novice A just opened up for Rex! ' +
        'Open My Entries to accept the offer before it expires.'
    );
  });

  it('includes a direct payment link when one is available', () => {
    expect(
      buildWaitlistOfferMessage({
        dogName: 'Rex',
        className: 'Novice A',
        paymentLinkUrl: 'https://checkout.stripe.com/c/pay/cs_waitlist_1',
      })
    ).toBe(
      'A waitlist spot in Novice A just opened up for Rex! ' +
        'Complete payment to claim it: https://checkout.stripe.com/c/pay/cs_waitlist_1'
    );
  });

  it('omits the dog clause when the dog name is missing', () => {
    expect(buildWaitlistOfferMessage({ dogName: null, className: 'Novice A' })).toBe(
      'A waitlist spot in Novice A just opened up! ' +
        'Open My Entries to accept the offer before it expires.'
    );
  });

  it('omits the class clause when the class name is missing', () => {
    expect(buildWaitlistOfferMessage({ dogName: 'Rex', className: null })).toBe(
      'A waitlist spot just opened up for Rex! ' +
        'Open My Entries to accept the offer before it expires.'
    );
  });

  it('falls back to the generic message when nothing is known', () => {
    expect(buildWaitlistOfferMessage({ dogName: null, className: null })).toBe(
      'A waitlist spot just opened up! ' + 'Open My Entries to accept the offer before it expires.'
    );
  });
});
