// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildRegistrationEmailHtml,
  payAtShowLine,
  payAtShowMethod,
} from './registrationEmailHtml';

const base = {
  firstName: 'Ada',
  confirmationNumber: 'CONF-1234',
  showName: 'Fall Trial',
  showDates: 'Oct 3, 2026',
  showLocation: 'Madison, WI',
  entries: [{ dogName: 'Rocket', className: 'Novice A' }],
  subtotal: 3000,
  total: 3000,
  paymentMethod: 'check',
  entriesUrl: 'https://myk9show.com/exhibitor/entries',
};

describe('payAtShowMethod', () => {
  it('names check or cash only while the entry is still unpaid', () => {
    expect(payAtShowMethod('check', 'pending')).toBe('check');
    expect(payAtShowMethod('cash', 'pending')).toBe('cash');
    expect(payAtShowMethod('check', 'paid')).toBeUndefined();
    expect(payAtShowMethod('online', 'pending')).toBeUndefined();
    expect(payAtShowMethod(null, null)).toBeUndefined();
  });
});

describe('payAtShowLine', () => {
  it('says who a check is payable to and that cash is the exact amount', () => {
    expect(payAtShowLine('check', 'Oak Valley Kennel Club')).toBe(
      'Pay at the show: check payable to Oak Valley Kennel Club.'
    );
    expect(payAtShowLine('check', undefined)).toBe(
      'Pay at the show: check payable to the hosting club.'
    );
    expect(payAtShowLine('cash', 'Oak Valley Kennel Club')).toBe(
      'Pay at the show: cash, exact amount.'
    );
    expect(payAtShowLine(undefined, 'Oak Valley Kennel Club')).toBeNull();
  });
});

describe('buildRegistrationEmailHtml', () => {
  it('replaces the payment line with the pay-at-show line for a check entry', () => {
    const html = buildRegistrationEmailHtml({
      ...base,
      payAtShow: 'check',
      clubName: 'Oak Valley Kennel Club',
    });
    expect(html).toContain('Pay at the show: check payable to Oak Valley Kennel Club.');
    expect(html).not.toContain('>check</p>');
  });

  it('says cash, exact amount, for a cash entry', () => {
    const html = buildRegistrationEmailHtml({ ...base, paymentMethod: 'cash', payAtShow: 'cash' });
    expect(html).toContain('Pay at the show: cash, exact amount.');
  });

  it('keeps the recorded payment method when nothing is owed at the show', () => {
    const html = buildRegistrationEmailHtml({ ...base, paymentMethod: 'online' });
    expect(html).not.toContain('Pay at the show');
    expect(html).toContain('>online</p>');
  });

  it('shows the confirmation number and total, links to My Shows and says where the armband will appear', () => {
    const html = buildRegistrationEmailHtml({ ...base, payAtShow: 'cash' });
    expect(html).toContain('CONF-1234');
    expect(html).toContain('$30.00');
    expect(html).toContain('href="https://myk9show.com/exhibitor/entries"');
    expect(html).toContain('Your armband number is assigned closer to the show.');
  });

  it('has no em dashes in the body', () => {
    expect(buildRegistrationEmailHtml({ ...base, payAtShow: 'check' })).not.toContain('—');
  });
});

describe('buildRegistrationEmailHtml confirmation number', () => {
  it('shows the recorded confirmation number', () => {
    expect(buildRegistrationEmailHtml(base)).toContain('CONF-1234');
  });

  it('omits the confirmation number block when there is none', () => {
    const html = buildRegistrationEmailHtml({ ...base, confirmationNumber: null });
    expect(html).not.toContain('Confirmation Number');
  });
});
