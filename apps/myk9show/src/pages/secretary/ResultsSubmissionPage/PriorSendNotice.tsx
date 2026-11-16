import { useMemo, useState } from 'react';
import { formatEntryDateTime } from '@/lib/format/dates';
import {
  useResultSubmissions,
  type ResultSubmissionRow,
} from '@/hooks/mutations/useResultSubmission';
import { SENT_FILE_TEXT } from '@/features/show-closeout/submissionTimes';
import { calculateWhatIsLeft, type SentFileCheck } from '@/features/show-closeout/whatIsLeft';
import { useShowDeskScheduleRead } from '../useShowDeskScheduleRead';
import { useResultsSentCheck } from '@/features/show-closeout/useResultsSentCheck';

/**
 * Whether the file the app sent to this registry still matches the scores (MYK9-2078). It is the
 * Finish the show list's own answer for that registry: the same schedule classes (with their
 * trial, so the registry mapping works), the same shared check, the same calculation. So a change
 * in another registry's classes never flags this one, and a queued offline score reads as
 * "unknown". After a corrected send lands the record moves and the answer clears on its own.
 *
 * From the moment each send starts until the send records refetch after it, the old answer would
 * describe the file before it: no answer until then, then the live answer again (a later change
 * shows). The mark is re-taken at the start of every send, so a second send on the same page waits
 * too, and a send that fails clears it.
 */
export function useSentFileCheckForSend(
  showId: string | undefined,
  formatter: { organization: string } | undefined,
  isSending: boolean,
  sendSucceeded: boolean
): SentFileCheck | undefined {
  const organization = formatter?.organization;
  const records = useResultSubmissions(showId ?? '');
  const [sentMark, setSentMark] = useState<number | null>(null);
  const [wasSending, setWasSending] = useState(false);
  if (isSending !== wasSending) {
    setWasSending(isSending);
    if (isSending) setSentMark(records.dataUpdatedAt);
  }
  if (!isSending && !sendSucceeded && sentMark !== null) setSentMark(null);
  const waitingForRecords = sentMark !== null && records.dataUpdatedAt <= sentMark;
  const schedule = useShowDeskScheduleRead();
  const { trials, classes } = useMemo(() => {
    const showTrials = schedule.trials
      .filter(trial => trial.showId === showId)
      .map(trial => ({ id: trial.id, registryId: trial.registryId }));
    return {
      trials: showTrials,
      classes: showTrials.flatMap(trial =>
        (schedule.trialClasses[trial.id] ?? []).map(cls => ({
          id: cls.id,
          trialId: trial.id,
          expectedCount: null,
          scoredCount: null,
        }))
      ),
    };
  }, [schedule.trialClasses, schedule.trials, showId]);
  const { submissions, scoreChanges } = useResultsSentCheck(
    showId ?? '',
    schedule.hasConfirmedSnapshot ? classes : null
  );
  return useMemo(() => {
    if (!organization || waitingForRecords) return undefined;
    const left = calculateWhatIsLeft({
      classes,
      trials,
      entries: [],
      incidents: null,
      submissions,
      scoreChanges,
    });
    return left.lines.find(
      line => line.kind === 'results-submission' && line.registryId === organization.toUpperCase()
    )?.sentFileCheck;
  }, [classes, organization, scoreChanges, submissions, trials, waitingForRecords]);
}

/**
 * One full-width line above the controls. During and right after a send the check has no answer
 * (`useSentFileCheckForSend`), so the notice is not shown then.
 */
export function ScoresChangedNotice({ check }: { check: SentFileCheck | undefined }) {
  if (check === undefined || check === 'current') return null;
  return (
    <p className="text-sm font-medium text-warning" data-testid="scores-changed-notice">
      {SENT_FILE_TEXT[check]}
      {check === 'changed' && ' Send the corrected results.'}
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
  check,
}: {
  prior: ResultSubmissionRow;
  check: SentFileCheck | undefined;
}) {
  const scoresChanged = check === 'changed';
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
