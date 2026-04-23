/**
 * Tests for the downloadable HTML receipt.
 *
 * Covers the XSS regression fixed during the 2026-04-23 entries-wizard harden:
 * user-controlled fields (dog/club/show names, etc.) must be HTML-escaped before
 * interpolation into the receipt template.
 */

import { describe, it, expect } from 'vitest';
import { generateReceiptHtml, type ReceiptData } from '../ConfirmationStep.helpers';
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
