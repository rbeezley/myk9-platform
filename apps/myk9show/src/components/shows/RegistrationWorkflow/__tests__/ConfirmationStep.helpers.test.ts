/**
 * Tests for the downloadable HTML receipt.
 *
 * Covers the XSS regression fixed during the 2026-04-23 entries-wizard harden:
 * user-controlled fields (dog/club/show names, etc.) must be HTML-escaped before
 * interpolation into the receipt template.
 */

import { describe, it, expect } from 'vitest';
import {
  generateReceiptHtml,
  getConfirmationHeroCopy,
  getPaymentMethodDisplay,
  isRegistrationRecorded,
  type ReceiptData,
} from '../ConfirmationStep.helpers';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

function makeReceipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    registrationNumber: 'REG-001',
    showName: 'Spring Trial',
    showClub: 'Acme K9',
    showDate: '2026-05-01',
    showLocation: 'Portland, OR',
    dogs: [
      {
        name: 'Rex',
        breed: 'Border Collie',
        classes: [
          {
            className: 'Novice A',
            classNumber: '101',
            trialName: 'Trial 1',
            jumpHeight: '12',
          },
        ],
      },
    ],
    totalFees: 50,
    paymentMethod: 'credit_card',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    entryStatus: EntryStatus.ACCEPTED,
    generatedAt: '2026-04-23 10:00 AM',
    ...overrides,
  };
}

describe('getPaymentMethodDisplay', () => {
  it('maps credit_card → Credit Card', () => {
    expect(getPaymentMethodDisplay('credit_card')).toBe('Credit Card');
  });

  it('maps check → Check (Pay at Show)', () => {
    expect(getPaymentMethodDisplay('check')).toBe('Check (Pay at Show)');
  });

  it('maps cash → Cash (Pay at Show)', () => {
    expect(getPaymentMethodDisplay('cash')).toBe('Cash (Pay at Show)');
  });

  it('maps waived → Fees Waived', () => {
    expect(getPaymentMethodDisplay('waived')).toBe('Fees Waived');
  });

  // Regression: empty string previously returned 'Unknown' when online payment
  // was the only option and the user never explicitly selected it.
  it('returns Credit/Debit Card for empty string (unset online payment)', () => {
    expect(getPaymentMethodDisplay('')).toBe('Credit/Debit Card (Online)');
  });

  it('returns Credit/Debit Card for unrecognised values', () => {
    expect(getPaymentMethodDisplay('stripe')).toBe('Credit/Debit Card (Online)');
  });
});

describe('getConfirmationHeroCopy', () => {
  // The confirmation step is always post-submit (the entry is written on the
  // Payment step's Next), so the copy is "submitted", never "ready to submit".
  it('confirms once the entry is accepted and payment is recorded', () => {
    expect(getConfirmationHeroCopy(EntryStatus.ACCEPTED, PaymentStatus.PAID_BY_CHECK)).toEqual({
      title: 'Registration Confirmed',
      description: 'Your entry has been submitted and payment recorded.',
    });
  });

  it('frames a pending check/cash entry as submitted with payment due at the show', () => {
    expect(getConfirmationHeroCopy(EntryStatus.PENDING, PaymentStatus.PENDING)).toEqual({
      title: 'Registration Submitted',
      description: 'Your entry has been submitted. Payment is due at the show.',
    });
  });

  it('keeps a deferred-but-accepted unpaid entry in submitted / payment-due language', () => {
    expect(getConfirmationHeroCopy(EntryStatus.ACCEPTED, PaymentStatus.PENDING)).toEqual({
      title: 'Registration Submitted',
      description: 'Your entry has been submitted. Payment is due at the show.',
    });
  });

  it('does not claim payment is due when an unaccepted entry is already paid', () => {
    // e.g. paid online but waitlisted / awaiting review — telling them payment
    // is due at the show would be wrong.
    expect(getConfirmationHeroCopy(EntryStatus.WAITLIST, PaymentStatus.PAID_ONLINE)).toEqual({
      title: 'Registration Submitted',
      description: 'Your entry has been submitted and payment recorded.',
    });
  });

  it('never uses pre-submit "ready to submit" framing for any post-submit state', () => {
    const samples: Array<[EntryStatus, PaymentStatus]> = [
      [EntryStatus.PENDING, PaymentStatus.PENDING],
      [EntryStatus.ACCEPTED, PaymentStatus.PAID_ONLINE],
      [EntryStatus.WAITLIST, PaymentStatus.PAID_ONLINE],
      [EntryStatus.MISSING_INFO, PaymentStatus.PENDING],
    ];
    for (const [entry, payment] of samples) {
      const copy = getConfirmationHeroCopy(entry, payment);
      expect(copy.title).not.toMatch(/ready to submit/i);
      expect(copy.description).not.toMatch(/to submit/i);
    }
  });
});

describe('isRegistrationRecorded', () => {
  it('requires both an accepted entry and a paid status', () => {
    expect(isRegistrationRecorded(EntryStatus.ACCEPTED, PaymentStatus.PAID_BY_CHECK)).toBe(true);
    expect(isRegistrationRecorded(EntryStatus.ACCEPTED, PaymentStatus.PENDING)).toBe(false);
    expect(isRegistrationRecorded(EntryStatus.PENDING, PaymentStatus.PAID_BY_CHECK)).toBe(false);
  });
});

describe('generateReceiptHtml — XSS protection', () => {
  it('escapes script tags in a dog name', () => {
    const html = generateReceiptHtml(
      makeReceipt({
        dogs: [
          {
            name: '<script>alert("pwn")</script>',
            breed: 'Collie',
            classes: [],
          },
        ],
      })
    );

    expect(html).not.toContain('<script>alert("pwn")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;pwn&quot;)&lt;/script&gt;');
  });

  it('escapes angle brackets in club and show names', () => {
    const html = generateReceiptHtml(
      makeReceipt({
        showName: '<img src=x onerror=alert(1)>',
        showClub: '<b>Bold Club</b>',
      })
    );

    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<b>Bold Club</b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;Bold Club&lt;/b&gt;');
  });

  it('escapes quote characters in class and trial names', () => {
    const html = generateReceiptHtml(
      makeReceipt({
        dogs: [
          {
            name: 'Rex',
            breed: 'Border Collie',
            classes: [
              {
                className: 'Novice"A',
                classNumber: "1'01",
                trialName: 'Trial <Main>',
                jumpHeight: '12',
              },
            ],
          },
        ],
      })
    );

    expect(html).toContain('Novice&quot;A');
    expect(html).toContain('1&#39;01');
    expect(html).toContain('Trial &lt;Main&gt;');
  });

  it('escapes ampersands so they do not disturb entities', () => {
    const html = generateReceiptHtml(makeReceipt({ showClub: 'Smith & Jones K9' }));

    expect(html).toContain('Smith &amp; Jones K9');
  });

  it('escapes the registration number in both title and body', () => {
    const html = generateReceiptHtml(makeReceipt({ registrationNumber: '<b>ABC</b>' }));

    // Appears in <title> tag and in the confirmation-number div
    expect(html).not.toContain('<b>ABC</b>');
    const escapedCount = (html.match(/&lt;b&gt;ABC&lt;\/b&gt;/g) ?? []).length;
    expect(escapedCount).toBeGreaterThanOrEqual(2);
  });
});
