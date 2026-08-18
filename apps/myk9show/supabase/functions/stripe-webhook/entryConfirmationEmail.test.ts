import { describe, expect, it } from 'vitest';

import { renderStripeEntryConfirmationEmail } from './entryConfirmationEmail.ts';

describe('renderStripeEntryConfirmationEmail', () => {
  it('renders paid totals and escapes exhibitor-controlled values', () => {
    const html = renderStripeEntryConfirmationEmail({
      exhibitorName: '<Ada & Co>',
      showName: 'Fall Trial',
      showDate: 'October 3, 2026',
      showLocation: 'Madison, WI',
      entries: [
        {
          dogName: '<Rocket>',
          className: 'Novice',
          classLevel: 'A',
          entryFee: 2500,
        },
      ],
      subtotal: 2500,
      platformFee: 125,
      total: 2625,
      orderId: 'cs_test_123',
    });

    expect(html).toContain('&lt;Ada &amp; Co&gt;');
    expect(html).toContain('&lt;Rocket&gt;');
    expect(html).toContain('$25.00');
    expect(html).toContain('$1.25');
    expect(html).toContain('$26.25');
    expect(html).not.toContain('<Ada & Co>');
  });
});
