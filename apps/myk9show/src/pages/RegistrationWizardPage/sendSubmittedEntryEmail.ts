/**
 * The one confirmation email for a check or cash entry (MYK9-1963).
 *
 * Sent when the exhibitor's own entry is submitted, never again from the
 * receipt step. The `send-registration-email` function keys the message to the
 * submission, so a retry of the same submission is the same message. Card
 * entries do not pass through here: their receipt comes from the Stripe
 * webhook once the payment lands.
 */

import { notifications } from '@/lib/notifications';
import { sendRegistrationConfirmationEmail } from '@/components/shows/RegistrationWorkflow/sendRegistrationConfirmationEmail';
import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import type { ShowRegistrationSubmissionResult } from '@/features/registration/submitShowRegistration';

export const CONFIRMATION_EMAIL_FAILED_MESSAGE =
  'Your entry is in, but we could not send the confirmation email. You can see it any time in My Shows.';

/** True only for an exhibitor's own submission that created at least one entry. */
export function shouldSendSubmittedEntryEmail(
  workflowMode: WorkflowMode,
  result: Pick<ShowRegistrationSubmissionResult, 'submissionId' | 'createdEntryOutcomes'>
): boolean {
  return (
    workflowMode === 'exhibitor' &&
    Boolean(result.submissionId) &&
    (result.createdEntryOutcomes?.length ?? 0) > 0
  );
}

/** Sends the email without holding the wizard; a failure is told, not thrown. */
export async function sendSubmittedEntryEmail(
  registrationId: string,
  submissionId: string
): Promise<void> {
  try {
    const result = await sendRegistrationConfirmationEmail(registrationId, submissionId);
    if (!result.ok) notifications.info(CONFIRMATION_EMAIL_FAILED_MESSAGE);
  } catch {
    notifications.info(CONFIRMATION_EMAIL_FAILED_MESSAGE);
  }
}
