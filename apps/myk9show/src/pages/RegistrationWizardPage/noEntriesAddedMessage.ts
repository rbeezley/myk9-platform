import type { EntrySubmissionOutcome } from '@/services/database/entries';
import { summarizeEntrySubmissionOutcomes } from '@/components/shows/RegistrationWorkflow/entrySubmissionOutcomes';

/**
 * MYK9-2159: the notice for a finished submission that created no entries, or
 * null when at least one entry was created (or no outcomes were surfaced, which
 * means a normal all-created submission). All denied and all waitlisted use the
 * receipt hero's own words (ConfirmationStep); a denied-and-waitlisted mix says
 * nothing was added and names the waitlist.
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
