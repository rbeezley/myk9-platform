import { logger } from '@/services/LoggingService';
import { deskPaymentsTable } from './deskPaymentDeps';
import type { DeskPaymentsTable } from './DeskPaymentsTable';

/** The device could not read its saved payments, so a form-wide change is not made. */
export const FORM_CHANGE_UNREADABLE =
  'Not changed: this device could not read its saved payments for this form. Try again.';

/** Another account's payment holds the change; nothing of it is named (shared-device plan § 2). */
export const FORM_CHANGE_OTHER_ACCOUNT =
  'Not changed: this device cannot confirm a payment for this form that was saved under another account. That account needs to sign in on this device and check it.';

/**
 * MYK9-2479: Payment Due and Paid in Full: Online set what the whole form owes, on the
 * server, at once. A cash or check payment this device holds would be recorded after that
 * change and undo it, so the change waits until myK9Show has confirmed every one of this
 * form's payments on this device, whichever account saved it
 * (docs/plan-offline-desk-payments-shared-device.md § 2). "Not confirmed", never "not
 * sent": a send whose answer was lost may already be recorded, and the message must not
 * read as a reason to record the cash again.
 * Returns what to tell her, or null when nothing is held.
 */
export async function formChangeBlockedBy(
  enrollmentId: string,
  table: Pick<DeskPaymentsTable, 'unconfirmedForEnrollment'> = deskPaymentsTable
): Promise<string | null> {
  let held;
  try {
    held = await table.unconfirmedForEnrollment(enrollmentId);
  } catch (error) {
    logger.warn('Desk payments not read before a form change', 'secretary', {}, error as Error);
    return FORM_CHANGE_UNREADABLE;
  }
  const { mine, others } = held;
  if (mine.length === 0) return others > 0 ? FORM_CHANGE_OTHER_ACCOUNT : null;
  const [only] = mine;
  const named =
    mine.length === 1 && only
      ? `A ${only.method} payment of $${only.amount.toFixed(2)} for this form is`
      : `${mine.length} payments for this form are`;
  const confirmed = mine.length === 1 ? 'it' : 'them';
  return `Not changed: ${named} saved on this device, and myK9Show has not confirmed ${confirmed} yet. Wait until the line under the balance clears, or remove a refused payment, then try again.`;
}
