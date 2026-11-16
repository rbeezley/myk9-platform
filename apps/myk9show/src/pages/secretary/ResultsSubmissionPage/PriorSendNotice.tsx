import { formatEntryDateTime } from '@/lib/format/dates';
import type { ResultSubmissionRow } from '@/hooks/mutations/useResultSubmission';

/** Why the secretary is sending again: the Finish the show line says scores changed (MYK9-2078). */
export const SCORES_CHANGED_REASON = 'changed';

export const SCORES_CHANGED_NOTICE =
  'Scores changed since this was sent. Send the corrected results.';

/**
 * The line in the send confirmation about an earlier record. A plain resend warns that it files a
 * second time; one she reached from "Results changed since they were sent" is deliberate, so it
 * says the earlier record stays and this one is added.
 */
export function PriorSendNotice({
  prior,
  scoresChanged,
}: {
  prior: ResultSubmissionRow;
  scoresChanged: boolean;
}) {
  const how = prior.status === 'sent' ? 'sent' : 'recorded as submitted';
  const when = formatEntryDateTime(prior.submitted_at);
  return (
    <span className="mb-2 block font-medium text-warning">
      {scoresChanged
        ? `These results were ${how} to ${prior.organization} on ${when}, and scores have changed since. Sending now adds a second send with the corrected results. The first stays on record.`
        : `These results were already ${how} to ${prior.organization} on ${when}. Sending again files a second time.`}
    </span>
  );
}
