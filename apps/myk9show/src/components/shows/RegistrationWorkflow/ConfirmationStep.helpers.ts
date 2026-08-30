import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CONFIRMATION_NUMBER_LABEL } from '@/features/registration/confirmationNumberDisplay';
import type { DogClassDetails } from './ConfirmationStep.types';

/** Data needed to generate a receipt */
export interface ReceiptData {
  registrationNumber: string;
  showName: string;
  showClub: string;
  showDate: string;
  showLocation: string;
  dogs: Array<{
    name: string;
    breed: string;
    classes: DogClassDetails[];
  }>;
  totalFees: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  entryStatus: EntryStatus;
  generatedAt: string;
}

export interface ConfirmationHeroCopy {
  title: string;
  description: string;
}

export function isRegistrationRecorded(
  entryStatus: EntryStatus,
  paymentStatus: PaymentStatus
): boolean {
  return entryStatus === EntryStatus.ACCEPTED && isPaidStatus(paymentStatus);
}

export function getConfirmationHeroCopy(
  entryStatus: EntryStatus,
  paymentStatus: PaymentStatus
): ConfirmationHeroCopy {
  // The confirmation step is always reached AFTER the entry is written — the
  // submit happens on the Payment step's Next (card checkout or
  // submitShowRegistration), and the wizard only advances here on success. So
  // the framing is never "ready to submit"; it's "submitted". The remaining
  // nuance is whether payment has been recorded yet.
  if (isRegistrationRecorded(entryStatus, paymentStatus)) {
    return {
      title: 'Registration Confirmed',
      description: 'Your entry has been submitted and payment recorded.',
    };
  }

  if (isPaidStatus(paymentStatus)) {
    // Paid, but the entry is not accepted yet (e.g. awaiting review or
    // waitlisted). Do not tell an already-paid exhibitor that payment is due
    // at the show — that would be wrong.
    return {
      title: 'Registration Submitted',
      description: 'Your entry has been submitted and payment recorded.',
    };
  }

  // Submitted, payment still pending (the common check/cash path).
  return {
    title: 'Registration Submitted',
    description: 'Your entry has been submitted. Payment is due at the show.',
  };
}

/** Generate a plain-text receipt for clipboard/download */
export function generateReceiptText(data: ReceiptData): string {
  const divider = '═'.repeat(48);
  const thinDivider = '─'.repeat(48);

  const lines: string[] = [
    divider,
    '           REGISTRATION RECEIPT',
    '               myK9Show',
    divider,
    '',
    `${CONFIRMATION_NUMBER_LABEL}: ${data.registrationNumber}`,
    `Date Generated: ${data.generatedAt}`,
    '',
    thinDivider,
    'SHOW INFORMATION',
    thinDivider,
    `Show:     ${data.showName}`,
    `Club:     ${data.showClub}`,
    `Date:     ${data.showDate}`,
    `Location: ${data.showLocation}`,
    '',
  ];

  for (const dog of data.dogs) {
    lines.push(thinDivider);
    lines.push(`DOG: ${dog.name}`);
    lines.push(`Breed: ${dog.breed}`);
    lines.push('');
    lines.push('  Classes:');
    for (const cls of dog.classes) {
      const height = cls.jumpHeight ? ` (${cls.jumpHeight}")` : '';
      lines.push(`    - ${cls.className} #${cls.classNumber}${height}`);
      lines.push(`      Trial: ${cls.trialName}`);
    }
    lines.push('');
  }

  lines.push(thinDivider);
  lines.push('PAYMENT');
  lines.push(thinDivider);
  lines.push(`Total Fees:     $${data.totalFees.toFixed(2)}`);
  lines.push(`Method:         ${getPaymentMethodDisplay(data.paymentMethod)}`);
  lines.push(`Payment Status: ${getPaymentStatusDisplay(data.paymentStatus)}`);
  lines.push(`Entry Status:   ${getEntryStatusDisplay(data.entryStatus)}`);
  lines.push('');
  lines.push(divider);
  lines.push('Thank you for your entry!');
  lines.push(divider);

  return lines.join('\n');
}

/** Escape a string for safe interpolation into HTML. */
function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Generate an HTML receipt for download */
export function generateReceiptHtml(data: ReceiptData): string {
  const dogSections = data.dogs
    .map(
      dog => `
      <div style="margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 8px;">
        <h3 style="margin: 0 0 5px 0; font-size: 16px;">${escapeHtml(dog.name)}</h3>
        <p style="margin: 0 0 10px 0; color: #666; font-size: 13px;">${escapeHtml(dog.breed)}</p>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <th style="text-align: left; padding: 6px 8px; font-size: 12px; color: #666; text-transform: uppercase;">Class</th>
              <th style="text-align: left; padding: 6px 8px; font-size: 12px; color: #666; text-transform: uppercase;">Trial</th>
              <th style="text-align: left; padding: 6px 8px; font-size: 12px; color: #666; text-transform: uppercase;">Jump Height</th>
            </tr>
          </thead>
          <tbody>
            ${dog.classes
              .map(
                cls => `
              <tr style="border-bottom: 1px solid #f0f0f0;">
                <td style="padding: 8px; font-size: 14px;">${escapeHtml(cls.className)} #${escapeHtml(cls.classNumber)}</td>
                <td style="padding: 8px; font-size: 14px;">${escapeHtml(cls.trialName)}</td>
                <td style="padding: 8px; font-size: 14px;">${cls.jumpHeight ? `${escapeHtml(cls.jumpHeight)}&quot;` : '-'}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Registration Receipt - ${escapeHtml(data.registrationNumber)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.5;
      color: #1a1a1a;
      padding: 40px;
      max-width: 700px;
      margin: 0 auto;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb;">
    <h1 style="font-size: 24px; margin: 0 0 5px 0;">Registration Receipt</h1>
    <p style="color: #666; margin: 0; font-size: 14px;">myK9Show</p>
  </div>

  <div style="background: #f3f4f6; border-radius: 8px; padding: 15px; text-align: center; margin-bottom: 25px;">
    <div style="font-size: 12px; color: #666; letter-spacing: 1px;">${CONFIRMATION_NUMBER_LABEL}</div>
    <div style="font-size: 24px; font-weight: 700; font-family: 'Courier New', monospace;">${escapeHtml(data.registrationNumber)}</div>
  </div>

  <div style="margin-bottom: 25px;">
    <h2 style="font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">Show Information</h2>
    <p style="margin: 8px 0;"><strong>${escapeHtml(data.showName)}</strong></p>
    <p style="margin: 4px 0; color: #666; font-size: 14px;">${escapeHtml(data.showClub)}</p>
    <p style="margin: 4px 0; color: #666; font-size: 14px;">${escapeHtml(data.showDate)}</p>
    <p style="margin: 4px 0; color: #666; font-size: 14px;">${escapeHtml(data.showLocation)}</p>
  </div>

  <div style="margin-bottom: 25px;">
    <h2 style="font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">Entries</h2>
    ${dogSections}
  </div>

  <div style="margin-bottom: 25px;">
    <h2 style="font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">Payment</h2>
    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
      <span>Total Fees</span>
      <strong style="font-family: 'Courier New', monospace; font-size: 18px;">$${data.totalFees.toFixed(2)}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
      <span>Payment Method</span>
      <span>${escapeHtml(getPaymentMethodDisplay(data.paymentMethod))}</span>
    </div>
    <div style="display: flex; justify-content: space-between; padding: 8px 0;">
      <span>Payment Status</span>
      <span>${escapeHtml(getPaymentStatusDisplay(data.paymentStatus))}</span>
    </div>
  </div>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #999;">
    <p>Thank you for your entry!</p>
    <p>Generated on ${escapeHtml(data.generatedAt)}</p>
  </div>
</body>
</html>`;
}

// Re-export downloadFile from shared export utility (used as downloadBlob alias)
export { downloadFile as downloadBlob } from '@/lib/export';

export function getPaymentMethodDisplay(paymentMethod: string): string {
  switch (paymentMethod) {
    case 'credit_card':
      return 'Credit Card';
    case 'check':
      return 'Check (Pay at Show)';
    case 'cash':
      return 'Cash (Pay at Show)';
    case 'secretary_paid':
      return 'Secretary Payment';
    case 'group_payment':
      return 'Group Payment';
    case 'waived':
      return 'Fees Waived';
    default:
      return 'Credit/Debit Card (Online)';
  }
}

/**
 * Theme-aware chip classes for a payment status. These were light-only raw
 * palette (bg-teal-100 / bg-red-100 / bg-gray-100), which painted a bright
 * block on the dark receipt card; the semantic tokens carry both modes and
 * already meet AA in each.
 */
export function getPaymentStatusBadgeColor(status: PaymentStatus): string {
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return 'bg-success/10 text-success border-success/20';
    case PaymentStatus.REFUNDED:
    case PaymentStatus.PARTIAL_REFUND:
      return 'bg-destructive/10 text-destructive border-destructive/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

/** Plain-English label for an entry status, for the same reason. */
export function getEntryStatusDisplay(status: EntryStatus | string): string {
  switch (status) {
    case EntryStatus.PENDING:
      return 'Pending';
    case EntryStatus.ACCEPTED:
      return 'Accepted';
    default:
      return String(status)
        .split(/[-_]/)
        .map(part => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
        .join(' ');
  }
}

/**
 * Plain-English label for a payment status. The enum value was being rendered
 * straight into the receipt, the plaintext copy and the email, so exhibitors
 * read "paid_online" and "partial_refund" as UI copy.
 */
export function getPaymentStatusDisplay(status: PaymentStatus | string): string {
  switch (status) {
    case PaymentStatus.PENDING:
      return 'Payment pending';
    case PaymentStatus.PAID_ONLINE:
      return 'Paid online';
    case PaymentStatus.PAID_BY_CHECK:
      return 'Paid by check';
    case PaymentStatus.PAID_BY_CASH:
      return 'Paid by cash';
    case PaymentStatus.REFUNDED:
      return 'Refunded';
    case PaymentStatus.PARTIAL_REFUND:
      return 'Partially refunded';
    case PaymentStatus.WAIVED:
      return 'Fees waived';
    default:
      return String(status);
  }
}

export function isPaidStatus(status: PaymentStatus): boolean {
  return (
    status === PaymentStatus.PAID_ONLINE ||
    status === PaymentStatus.PAID_BY_CHECK ||
    status === PaymentStatus.PAID_BY_CASH
  );
}
