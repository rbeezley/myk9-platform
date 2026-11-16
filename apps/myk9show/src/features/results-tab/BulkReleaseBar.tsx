import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ResultsClassRow } from './buildResultsClassRows';
import type { BulkRelease } from './useBulkRelease';

const classLabel = (row: ResultsClassRow) => [row.name, row.trialLabel].filter(Boolean).join(', ');

/**
 * The "Release N classes" action and its confirm dialog (MYK9-2072). Shown only while at least one
 * class is ticked, so there is no "release everything" control. The dialog names every ticked class
 * and says the secretary is confirming the scores match the judge's paper sheets.
 */
export function BulkReleaseBar({ bulk }: { bulk: BulkRelease }) {
  const count = bulk.tickedRows.length;
  const { failures } = bulk;
  return (
    <>
      {count > 0 && (
        <div className="mb-2 flex justify-end">
          <Button
            type="button"
            className="min-h-11"
            disabled={bulk.ticks.disabled}
            onClick={bulk.openDialog}
          >
            {count === 1 ? 'Release 1 class' : `Release ${count} classes`}
          </Button>
        </div>
      )}
      <Dialog open={bulk.dialogOpen} onOpenChange={open => !open && bulk.closeDialog()}>
        <DialogContent>
          {failures ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {failures.length === 1
                    ? '1 class was not released'
                    : `${failures.length} classes were not released`}
                </DialogTitle>
                <DialogDescription>
                  {bulk.releasedCount > 0
                    ? `${bulk.releasedCount} released. These are still ticked: fix what is noted, then release them again.`
                    : 'These are still ticked: fix what is noted, then release them again.'}
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-2 text-sm">
                {failures.map(({ row, message }) => (
                  <li key={row.id}>
                    <span className="font-medium">{classLabel(row)}</span>
                    <span className="block text-muted-foreground">{message}</span>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button type="button" className="min-h-11" onClick={bulk.closeDialog}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {count === 1 ? 'Release 1 class?' : `Release ${count} classes?`}
                </DialogTitle>
                <DialogDescription>
                  You are confirming the scores match the judge&apos;s paper sheets. Releasing makes
                  these results visible to exhibitors.
                </DialogDescription>
              </DialogHeader>
              <ul className="list-disc space-y-1 pl-5 text-sm" aria-label="Classes to release">
                {bulk.tickedRows.map(row => (
                  <li key={row.id}>{classLabel(row)}</li>
                ))}
              </ul>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={bulk.running}
                  onClick={bulk.closeDialog}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={bulk.running || count === 0}
                  onClick={bulk.confirm}
                >
                  {bulk.running
                    ? 'Releasing…'
                    : count === 1
                      ? 'Release 1 class'
                      : `Release ${count} classes`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
