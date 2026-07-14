import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  replicatedClassesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import {
  buildCloseoutReadiness,
  isShowClosedOut,
  selectCloseoutCascadeTargets,
  type CloseoutClassSummary,
  type CloseoutShowSummary,
  type CloseoutTrialSummary,
  type ResultSubmissionSummary,
} from './showCloseOutShow';
import type { ShowDayReconciliationEntry } from './showDayReconciliationSummary';
import type { ShowIncidentSummary } from './showIncidents';

interface CloseOutShowActionProps {
  show: CloseoutShowSummary;
  trials: CloseoutTrialSummary[];
  classes: CloseoutClassSummary[];
  entries: ShowDayReconciliationEntry[];
  incidents: Pick<ShowIncidentSummary, 'reportableCount' | 'urgentCount'>;
  submissions: ResultSubmissionSummary[];
}

export function CloseOutShowAction({
  show,
  trials,
  classes,
  entries,
  incidents,
  submissions,
}: CloseOutShowActionProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readiness = useMemo(
    () => buildCloseoutReadiness({ classes, entries, incidents, submissions }),
    [classes, entries, incidents, submissions]
  );
  const targets = useMemo(
    () => selectCloseoutCascadeTargets({ show, trials, classes }),
    [classes, show, trials]
  );
  const showClosed = isShowClosedOut(show.status);

  async function closeOutShow() {
    setIsClosing(true);
    setError(null);

    const childUpdates = [
      ...targets.trialIds.map(trialId =>
        replicatedTrialsTable.updateTrial(trialId, { status: 'completed' })
      ),
      ...targets.classIds.map(classId =>
        replicatedClassesTable.updateClass(classId, { classStatus: 'completed' })
      ),
    ];

    const childResults = await Promise.allSettled(childUpdates);
    const failedChildCount = childResults.filter(result => result.status === 'rejected').length;

    if (failedChildCount > 0) {
      setIsClosing(false);
      setError(
        'Closeout did not finish. Try again after checking your connection and sync status.'
      );
      toast.error('Closeout did not finish. Please try again.');
      return;
    }

    try {
      await replicatedShowsTable.updateShow(targets.showId, { status: 'completed' });
    } catch {
      setIsClosing(false);
      setError(
        'Closeout did not finish. Try again after checking your connection and sync status.'
      );
      toast.error('Closeout did not finish. Please try again.');
      return;
    }

    setIsClosing(false);
    setIsConfirmOpen(false);
    toast.success('Show closeout recorded. Changes will sync with the show data.');
  }

  if (showClosed) {
    return (
      <section className="rounded-md border bg-muted/30 p-4" aria-labelledby="close-out-show-title">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden="true" />
          <div>
            <h3 id="close-out-show-title" className="text-base font-semibold">
              Show closed out
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This show is marked completed. Reports and submission history remain available here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="close-out-show-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id="close-out-show-title" className="text-base font-semibold">
            Close Out Show
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Mark the show, trials, and open classes completed after reports and submissions are
            handled.
          </p>
        </div>

        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" disabled={isClosing} className="w-full sm:w-auto">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              {isClosing ? 'Closing...' : 'Close Out Show'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Close out this show?</AlertDialogTitle>
              <AlertDialogDescription>
                This marks the show completed and queues completion updates for open trials and
                classes. Reports and submission records will stay available.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {readiness.hasConcerns && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <div className="flex items-start gap-2 font-medium text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" aria-hidden="true" />
                  Review before closing
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {readiness.concerns.map(concern => (
                    <li key={concern}>{concern}</li>
                  ))}
                </ul>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isClosing}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={closeOutShow} disabled={isClosing}>
                {readiness.hasConcerns ? 'Close anyway' : 'Close out show'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {readiness.hasConcerns ? (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <div className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" aria-hidden="true" />
            Review before final closeout
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {readiness.concerns.map(concern => (
              <li key={concern}>{concern}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          No unresolved closeout concerns found in myK9.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
