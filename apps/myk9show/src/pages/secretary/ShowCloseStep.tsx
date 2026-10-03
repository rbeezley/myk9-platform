import { useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ShowCloseoutSummary } from '@/features/show-workbench/ShowCloseoutSummary';
import { CloseOutShowAction } from '@/features/show-workbench/CloseOutShowAction';
import { ShowDeskEntriesUnavailable } from './ShowDeskEntriesUnavailable';
import { ShowDeskEntriesFailed } from './ShowDeskEntriesFailed';
import {
  ShowDeskScheduleRefreshWarning,
  ShowDeskScheduleUnavailable,
} from './ShowDeskScheduleReadState';
import { useShowCloseoutInputs } from './useShowCloseoutInputs';
import { Button } from '@/components/ui/button';

/** Close Out Show is withheld until its readiness inputs were actually read. */
function CloseoutChecksUnread({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (!failed) {
    return (
      <p role="status" className="rounded-md border p-4 text-sm text-muted-foreground">
        Checking incidents and result submissions before the show can be closed…
      </p>
    );
  }
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
      <p className="font-medium">Couldn&rsquo;t check incidents and result submissions.</p>
      <p className="mt-1 text-muted-foreground">
        Closing the show is paused until both can be read, so an open incident or a missing
        submission is never missed.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/**
 * Results step 3, "Close the show" (MYK9-954). Show Day's closeout tool moved
 * here so the end of the show sits after Review & release and Submit to
 * registry. The summary and the close action are mounted unchanged; the
 * tool's Results / Reports / Submit shortcut buttons were dropped because this
 * page is Results.
 */
export default function ShowCloseStep() {
  const params = useParams<{ showId?: string; id?: string }>();
  const inputs = useShowCloseoutInputs(params.showId ?? params.id);
  const { show, schedule } = inputs;
  const retrySchedule = () => void schedule.retry();

  if (inputs.showLoading || !show || inputs.entriesLoading) {
    return <LoadingSkeleton variant="cards" count={2} />;
  }

  if (!schedule.hasConfirmedSnapshot && (schedule.readFailed || schedule.readPending)) {
    return (
      <ShowDeskScheduleUnavailable
        hasConfirmedSnapshot={schedule.hasConfirmedSnapshot}
        readFailed={schedule.readFailed}
        readPending={schedule.readPending}
        onRetry={retrySchedule}
      />
    );
  }

  // Same rule as Show Day: with no entries read, a closeout would state counts
  // and readiness it never read.
  if (inputs.entriesFailed) {
    return (
      <ShowDeskEntriesFailed pausedWhat="The closeout counts are" onRetry={inputs.retryEntries} />
    );
  }

  return (
    <div className="space-y-4">
      <ShowDeskScheduleRefreshWarning
        hasConfirmedSnapshot={schedule.hasConfirmedSnapshot}
        readFailed={schedule.readFailed}
        onRetry={retrySchedule}
      />
      {inputs.entriesUnavailable && <ShowDeskEntriesUnavailable onRetry={inputs.retryEntries} />}
      <ShowCloseoutSummary
        showId={show.id}
        entries={inputs.entries}
        deskWindow={inputs.deskWindow}
      />
      {inputs.closeoutChecks === 'read' ? (
        <CloseOutShowAction
          show={{ id: show.id, status: show.status }}
          trials={inputs.trials}
          classes={inputs.classes}
          entries={inputs.entries}
          incidents={inputs.incidents}
          submissions={inputs.submissions}
        />
      ) : (
        <CloseoutChecksUnread
          failed={inputs.closeoutChecks === 'failed'}
          onRetry={inputs.retryCloseoutChecks}
        />
      )}
    </div>
  );
}
