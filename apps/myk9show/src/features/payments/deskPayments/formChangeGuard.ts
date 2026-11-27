import { logger } from '@/services/LoggingService';
import { deskPaymentsTable } from './deskPaymentDeps';
import type { DeskPaymentsTable } from './DeskPaymentsTable';

/** The device could not read its saved payments, so a form-wide change is not made. */
export const FORM_CHANGE_UNREADABLE =
  'Not changed: this device could not read its saved payments for this form. Try again.';

/**
 * MYK9-2479 (Codex round 6 on #4461): Payment Due and Paid in Full: Online set what the
 * whole form owes, on the server, at once. A cash or check payment still on this device
 * would be recorded after that change and undo it, so the change waits until every one
 * of this form's payments has reached the server (or a refused one is removed).
 * Returns what to tell her, or null when nothing is held.
 */
export async function formChangeBlockedBy(
  enrollmentId: string,
  table: Pick<DeskPaymentsTable, 'unsentForEnrollment'> = deskPaymentsTable
): Promise<string | null> {
  let unsent;
  try {
    unsent = await table.unsentForEnrollment(enrollmentId);
  } catch (error) {
    logger.warn('Desk payments not read before a form change', 'secretary', {}, error as Error);
    return FORM_CHANGE_UNREADABLE;
  }
  if (unsent.length === 0) return null;
  const [only] = unsent;
  const held =
    unsent.length === 1 && only
      ? `A ${only.method} payment of $${only.amount.toFixed(2)}`
      : `${unsent.length} payments`;
  const [is, has] = unsent.length === 1 ? ['is', 'has'] : ['are', 'have'];
  return `Not changed: ${held} for this form ${is} saved on this device and ${has} not reached myK9Show yet. Wait until the line under the balance clears, or remove a refused payment, then try again.`;
}
