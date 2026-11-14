/**
 * The one confirmation email for a check or cash submission (MYK9-1963).
 *
 * Asked for when the exhibitor's own submission is filed, never from the receipt step.
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

/** The entries to email: only an exhibitor's own submission, only the entries it created. */
export function submittedEntryIdsToEmail(
  workflowMode: WorkflowMode,
  result: Pick<ShowRegistrationSubmissionResult, 'createdEntryOutcomes'>
): string[] {
  if (workflowMode !== 'exhibitor') return [];
  return (result.createdEntryOutcomes ?? []).flatMap(outcome =>
    outcome.entryId ? [outcome.entryId] : []
  );
}

/** Asks for the email without holding the wizard; a failure is told, not thrown. */
export async function sendSubmittedEntryEmail(
  registrationId: string,
  entryIds: string[]
): Promise<void> {
  try {
    const result = await sendRegistrationConfirmationEmail(registrationId, entryIds);
    if (!result.ok) notifications.info(CONFIRMATION_EMAIL_FAILED_MESSAGE);
  } catch {
    notifications.info(CONFIRMATION_EMAIL_FAILED_MESSAGE);
  }
}
