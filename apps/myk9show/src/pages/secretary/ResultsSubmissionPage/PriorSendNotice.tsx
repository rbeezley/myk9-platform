import { formatEntryDateTime } from '@/lib/format/dates';
import type { ResultSubmissionRow } from '@/hooks/mutations/useResultSubmission';
import { scoresChangedSinceSend } from '@/features/show-closeout/submissionTimes';
import { useResultsSentCheck } from '@/features/show-closeout/useResultsSentCheck';

/**
 * Whether a score the file carries changed after the last send (or recorded filing) to this
 * registry (MYK9-2078). The same shared check the Finish the show list and the close step read, so
 * after a corrected send lands the record moves and the notice goes away on its own.
 */
export function useScoresChangedSinceSend(
  showId: string | undefined,
  organization: string | undefined
): boolean {
  const { submissions, scoreChanges } = useResultsSentCheck(showId ?? '', []);
  return scoresChangedSinceSend(submissions, scoreChanges, organization);
}

export function ScoresChangedNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="text-sm font-medium text-warning" data-testid="scores-changed-notice">
      Scores changed since this was sent. Send the corrected results.
    </p>
  );
}

/**
 * The line in the send confirmation about an earlier record. A plain resend warns that it files a
 * second time; one made because scores changed is deliberate, so it says the earlier record stays
 * and this one is added.
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
