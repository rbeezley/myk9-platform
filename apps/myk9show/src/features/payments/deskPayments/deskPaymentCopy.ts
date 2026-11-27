import type { DeskPaymentLine, DeskPaymentState } from './deskPaymentTypes';

const METHOD_LABEL = { cash: 'Cash', check: 'Check' } as const;

/** The device could not read its saved payments: not the same as having none. */
export const DESK_PAYMENTS_UNREADABLE =
  'This device could not read its saved payments. Do not record a payment for this form again until it can.';

function receivedAtLabel(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** What the line says after the payment itself, by what is known about it. */
const STATE_COPY: Record<Exclude<DeskPaymentState, 'refused'>, string> = {
  waiting: 'waiting to send.',
  unconfirmed: 'not confirmed. It will be sent again on its own.',
  'unconfirmed-stopped': 'not confirmed. It will not be sent on its own.',
  'not-checked':
    'not confirmed. This device cannot confirm it, and it will not be sent on its own.',
};

/** One payment held on this device, worded by what is known (plan § 2, "Beside the balance"). */
export function deskPaymentLineText(line: DeskPaymentLine): string {
  const { payment } = line;
  const time = receivedAtLabel(payment.receivedAt);
  const lead = `${METHOD_LABEL[payment.method]} $${payment.amount.toFixed(2)} received${time ? ` at ${time}` : ''}`;
  if (line.state === 'refused') return `${lead}, could not be sent: ${line.reason ?? 'refused'}.`;
  return `${lead}, ${STATE_COPY[line.state]}`;
}
