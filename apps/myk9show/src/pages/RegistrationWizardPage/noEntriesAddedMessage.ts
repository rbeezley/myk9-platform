import type { EntrySubmissionOutcome } from '@/services/database/entries';
import { summarizeEntrySubmissionOutcomes } from '@/components/shows/RegistrationWorkflow/entrySubmissionOutcomes';

/**
 * MYK9-2159: the notice for a finished submission that created no entries, or
 * null when at least one entry was created (or no outcomes were surfaced, which
 * means a normal all-created submission). Wording mirrors the receipt hero in
 * ConfirmationStep: "No entries were added" when everything was denied, and the
 * receipt's own waitlist title when every selection was waitlisted.
 */
export function noEntriesAddedMessage(
  outcomes: EntrySubmissionOutcome[] | undefined
): string | null {
  if (!outcomes || outcomes.length === 0) return null;
  const { createdCount, waitlistedCount } = summarizeEntrySubmissionOutcomes(outcomes);
  if (createdCount > 0) return null;
  if (waitlistedCount === outcomes.length) {
    return 'Added to the waitlist. No payment is due unless a spot is offered.';
  }
  return waitlistedCount > 0
    ? 'No entries were added. Some selections joined the waitlist.'
    : 'No entries were added';
}
