import { describe, it, expect } from 'vitest';
import { buildWaitlistOfferMessage } from '../waitlistOfferMessage';

describe('buildWaitlistOfferMessage', () => {
  it('includes dog and class when both are known', () => {
    expect(buildWaitlistOfferMessage({ dogName: 'Rex', className: 'Novice A' })).toBe(
      'A waitlist spot in Novice A just opened up for Rex! ' +
        'Open My Entries to accept the offer before it expires.'
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
      'A waitlist spot just opened up! ' +
        'Open My Entries to accept the offer before it expires.'
    );
  });
});
