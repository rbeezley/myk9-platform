import { Mail, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { EntryDecisionEmailJob, EntryDecisionEmailStatus } from './api';

interface EntryDecisionEmailStatusProps {
  entry: EntryManagementEntry;
  status?: EntryDecisionEmailStatus | null | undefined;
  onReviewReady: (job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void;
  onPrepareCorrection: (job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void;
}

export function EntryDecisionEmailStatusBadge({
  entry,
  status,
  onReviewReady,
  onPrepareCorrection,
}: EntryDecisionEmailStatusProps) {
  const readyJob = status?.readyJob ?? null;
  const sentJob = status?.sentDecisionJob ?? null;
  const sentCorrectionJob = status?.sentCorrectionJob ?? null;
  const needsCorrection = sentJob ? entryStatusChangedSinceSent(sentJob, entry.entryStatus) : false;

  if (readyJob) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 px-2 text-xs"
        onClick={() => onReviewReady(readyJob, entry)}
      >
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        {readyJob.correctionForJobId ? 'Correction ready' : 'Email ready'}
      </Button>
    );
  }

  if (!sentJob) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="rounded-full border border-border/70 px-2 py-1 text-xs text-muted-foreground">
        {sentJob.stepType === 'accepted' ? 'Acceptance sent' : 'Waitlist sent'}
        {sentCorrectionJob ? ' · corrected' : ''}
      </span>
      {needsCorrection && !sentCorrectionJob ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          onClick={() => onPrepareCorrection(sentJob, entry)}
        >
          <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
          Prepare correction
        </Button>
      ) : null}
    </span>
  );
}

function entryStatusChangedSinceSent(
  job: EntryDecisionEmailJob,
  currentStatus: EntryStatus
): boolean {
  if (job.stepType === 'accepted') return currentStatus !== EntryStatus.ACCEPTED;
  return currentStatus !== EntryStatus.WAITLIST;
}
