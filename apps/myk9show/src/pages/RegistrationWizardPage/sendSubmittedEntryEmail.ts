/**
 * The one confirmation email for a check or cash submission (MYK9-1963).
 *
 * Asked for when a submission is filed, never from the receipt step: the exhibitor's own, and
 * (MYK9-1999) a mail-in entry a show official keys for her, which goes to the exhibitor when she
 * has an email address.
 * The server sends it: `send-registration-email` claims the submission's entries and sends
 * once for the entries it claimed, so a retry, a double submit or the scheduled
 * `send-confirmation-email` sender cannot produce a second receipt. Card entries do not pass
 * through here: their receipt comes from the Stripe webhook once the payment lands.
 */

import { notifications } from '@/lib/notifications';
import { sendRegistrationConfirmationEmail } from '@/components/shows/RegistrationWorkflow/sendRegistrationConfirmationEmail';
import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import type { ShowRegistrationSubmissionResult } from '@/features/registration/submitShowRegistration';

export const CONFIRMATION_EMAIL_FAILED_MESSAGE =
  'Your entry is in, but we could not send the confirmation email. You can see it any time in My Shows, and the show secretary can resend it.';

/** What a show official is told when the receipt for an entry she keyed could not be sent. */
export const KEYED_RECEIPT_FAILED_MESSAGE =
  'The entry is saved, but the receipt email could not be sent. The exhibitor may have no email address on file.';

/** The entries to email: only the entries the submission created, whoever filed it. */
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
  const failed =
    workflowMode === 'exhibitor' ? CONFIRMATION_EMAIL_FAILED_MESSAGE : KEYED_RECEIPT_FAILED_MESSAGE;
  try {
    const result = await sendRegistrationConfirmationEmail(registrationId, entryIds);
    if (!result.ok) notifications.info(failed);
  } catch {
    notifications.info(failed);
  }
}
