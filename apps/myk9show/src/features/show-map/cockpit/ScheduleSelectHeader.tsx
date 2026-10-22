import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { ScheduleClassSelection } from './useScheduleClassSelection';

/** The schedule's heading while Select classes is on (MYK9-1324), with its Done. */
export function ScheduleSelectHeader({
  selection,
  switchedFromLabel,
}: {
  selection: ScheduleClassSelection;
  /** The trial whose ticks the last tick replaced, named so the secretary knows they went. */
  switchedFromLabel: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="cockpit-schedule-title" className="text-2xl font-semibold tracking-tight">
            Select classes
          </h2>
          <p className="text-sm text-muted-foreground">
            Tick classes in one trial to assign a judge, change status, export or delete them
            together.
          </p>
        </div>
        <Button type="button" className="min-h-11 gap-2" onClick={selection.done}>
          <Check className="h-4 w-4" aria-hidden="true" />
          Done
        </Button>
      </div>
      {switchedFromLabel && (
        <p role="status" className="text-sm text-muted-foreground">
          Bulk actions work on one trial at a time, so your selection in {switchedFromLabel} was
          cleared.
        </p>
      )}
    </div>
  );
}
