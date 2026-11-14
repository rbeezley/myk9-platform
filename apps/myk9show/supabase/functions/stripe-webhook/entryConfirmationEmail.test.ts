// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  renderStripeEntryConfirmationEmail,
  type StripeEntryConfirmationEmailData,
} from './entryConfirmationEmail.ts';

const base: StripeEntryConfirmationEmailData = {
  exhibitorName: 'Ada',
  showName: 'Fall Trial',
  showDate: 'October 3, 2026',
  entries: [{ dogName: 'Rocket', className: 'Novice', classLevel: 'A', entryFee: 2500 }],
  subtotal: 2500,
  serviceFee: 125,
  total: 2625,
  confirmationNumber: 'CONF-1234',
  entriesUrl: 'https://myk9show.com/exhibitor/entries',
};

describe('renderStripeEntryConfirmationEmail', () => {
  it('renders paid totals and escapes exhibitor-controlled values', () => {
    const html = renderStripeEntryConfirmationEmail({
      ...base,
      exhibitorName: '<Ada & Co>',
      entries: [{ dogName: '<Rocket>', className: 'Novice', classLevel: 'A', entryFee: 2500 }],
    });

    expect(html).toContain('&lt;Ada &amp; Co&gt;');
    expect(html).toContain('&lt;Rocket&gt;');
    expect(html).toContain('$25.00');
    expect(html).toContain('$1.25');
    expect(html).toContain('$26.25');
    expect(html).not.toContain('<Ada & Co>');
  });

  it('says Service fee, never Platform fee', () => {
    const html = renderStripeEntryConfirmationEmail(base);
    expect(html).toContain('Service fee: <strong>$1.25</strong>');
    expect(html).not.toContain('Platform fee');
  });

  it("prints the order's confirmation number, never a Stripe session id", () => {
    const html = renderStripeEntryConfirmationEmail(base);
    expect(html).toContain('CONF-1234');
    expect(html).not.toMatch(/Order\s+cs_/);
    expect(html).not.toContain('cs_');
  });

  it('omits the confirmation block when the order has none, rather than minting one', () => {
    const html = renderStripeEntryConfirmationEmail({ ...base, confirmationNumber: null });
    expect(html).not.toContain('Confirmation number');
  });

  it('links to My Shows and says where the armband will appear', () => {
    const html = renderStripeEntryConfirmationEmail(base);
    expect(html).toContain('href="https://myk9show.com/exhibitor/entries"');
    expect(html).toContain('Your armband number is assigned closer to the show.');
    expect(html).toContain('appear next to each dog in My Shows');
  });

  it('shows the amount charged as the total and names entries the show could not accept', () => {
    const html = renderStripeEntryConfirmationEmail({
      ...base,
      total: 5250,
      refundPendingCents: 2625,
    });
    expect(html).toContain('Total charged: <strong>$52.50</strong>');
    expect(html).toContain('$26.25</strong> (refund under review)');
  });

  it('has no em dashes in what the exhibitor reads', () => {
    expect(renderStripeEntryConfirmationEmail(base)).not.toContain('—');
  });
});
