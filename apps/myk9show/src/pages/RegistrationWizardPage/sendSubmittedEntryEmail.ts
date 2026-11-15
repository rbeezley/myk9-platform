/**
 * The one receipt for a check or cash submission (MYK9-1963), whoever keyed it in.
 *
 * Asked for when the submission is filed, never from the receipt step. The server sends it:
 * `send-registration-email` claims the submission's entries and sends once for the entries it
 * claimed, so a retry, a double submit or the scheduled `send-confirmation-email` sweep cannot
 * produce a second receipt. Card entries do not pass through here: their receipt comes from the
 * Stripe webhook once the payment lands.
 *
 * MYK9-1999: a mail-in entry the secretary keys in gets the same receipt as one the exhibitor
 * files herself. The server sends it to the exhibitor's email address; with none on file it
 * sends nothing and says so in Delivery history.
 */

import { notifications } from '@/lib/notifications';
import { sendRegistrationConfirmationEmail } from '@/components/shows/RegistrationWorkflow/sendRegistrationConfirmationEmail';
import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import type { ShowRegistrationSubmissionResult } from '@/features/registration/submitShowRegistration';

export const CONFIRMATION_EMAIL_FAILED_MESSAGE =
  'Your entry is in, but we could not send the confirmation email. You can see it any time in My Shows, and the show secretary can resend it.';

/** What staff are told: the exhibitor, not the person at the keyboard, was to get it. */
export const STAFF_RECEIPT_FAILED_MESSAGE =
  'The entry is saved, but the receipt could not be sent. The exhibitor may have no email address on file. You can resend it from Entries.';

/** The entries to email: only the entries this submission created. */
export function submittedEntryIdsToEmail(
  result: Pick<ShowRegistrationSubmissionResult, 'createdEntryOutcomes'>
): string[] {
  return (result.createdEntryOutcomes ?? []).flatMap(outcome =>
    outcome.entryId ? [outcome.entryId] : []
  );
}

/** Asks for the email without holding the wizard; a failure is told, not thrown. */
export async function sendSubmittedEntryEmail(
  registrationId: string,
  entryIds: string[],
  workflowMode: WorkflowMode = 'exhibitor'
): Promise<void> {
  const failedMessage =
    workflowMode === 'exhibitor' ? CONFIRMATION_EMAIL_FAILED_MESSAGE : STAFF_RECEIPT_FAILED_MESSAGE;
  try {
    const result = await sendRegistrationConfirmationEmail(registrationId, entryIds);
    if (!result.ok) notifications.info(failedMessage);
  } catch {
    notifications.info(failedMessage);
  }
}
