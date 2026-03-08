import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
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
    `Confirmation #: ${data.registrationNumber}`,
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
  lines.push(`Payment Status: ${data.paymentStatus}`);
  lines.push(`Entry Status:   ${data.entryStatus}`);
  lines.push('');
  lines.push(divider);
  lines.push('Thank you for your entry!');
  lines.push(divider);

  return lines.join('\n');
}

/** Generate an HTML receipt for download */
export function generateReceiptHtml(data: ReceiptData): string {
  const dogSections = data.dogs
    .map(
      dog => `
      <div style="margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 8px;">
        <h3 style="margin: 0 0 5px 0; font-size: 16px;">${dog.name}</h3>
        <p style="margin: 0 0 10px 0; color: #666; font-size: 13px;">${dog.breed}</p>
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
                <td style="padding: 8px; font-size: 14px;">${cls.className} #${cls.classNumber}</td>
                <td style="padding: 8px; font-size: 14px;">${cls.trialName}</td>
                <td style="padding: 8px; font-size: 14px;">${cls.jumpHeight ? `${cls.jumpHeight}"` : '-'}</td>
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
  <title>Registration Receipt - ${data.registrationNumber}</title>
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
    <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Confirmation Number</div>
    <div style="font-size: 24px; font-weight: 700; font-family: 'Courier New', monospace;">${data.registrationNumber}</div>
  </div>

  <div style="margin-bottom: 25px;">
    <h2 style="font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">Show Information</h2>
    <p style="margin: 8px 0;"><strong>${data.showName}</strong></p>
    <p style="margin: 4px 0; color: #666; font-size: 14px;">${data.showClub}</p>
    <p style="margin: 4px 0; color: #666; font-size: 14px;">${data.showDate}</p>
    <p style="margin: 4px 0; color: #666; font-size: 14px;">${data.showLocation}</p>
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
      <span>${getPaymentMethodDisplay(data.paymentMethod)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; padding: 8px 0;">
      <span>Payment Status</span>
      <span>${data.paymentStatus}</span>
    </div>
  </div>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #999;">
    <p>Thank you for your entry!</p>
    <p>Generated on ${data.generatedAt}</p>
  </div>
</body>
</html>`;
}

/** Trigger a file download in the browser */
export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

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
      return 'Unknown';
  }
}

export function getStatusBadgeVariant(
  status: EntryStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case EntryStatus.ACCEPTED:
      return 'default';
    case EntryStatus.PENDING:
      return 'secondary';
    case EntryStatus.REJECTED:
      return 'destructive';
    case EntryStatus.WAITLIST:
      return 'outline';
    case EntryStatus.MISSING_INFO:
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function getEntryStatusBadgeColor(status: EntryStatus): string {
  switch (status) {
    case EntryStatus.ACCEPTED:
      return 'bg-green-100 text-green-800 border-green-200';
    case EntryStatus.REJECTED:
      return 'bg-red-100 text-red-800 border-red-200';
    case EntryStatus.WAITLIST:
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case EntryStatus.MISSING_INFO:
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function getPaymentStatusBadgeColor(status: PaymentStatus): string {
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return 'bg-green-100 text-green-800 border-green-200';
    case PaymentStatus.REFUNDED:
    case PaymentStatus.PARTIAL_REFUND:
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function isPaidStatus(status: PaymentStatus): boolean {
  return (
    status === PaymentStatus.PAID_ONLINE ||
    status === PaymentStatus.PAID_BY_CHECK ||
    status === PaymentStatus.PAID_BY_CASH
  );
}
