import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ClassStatusBadge } from './ClassOperationalControls';
import type { FocusedClassEditAction } from './FocusedClassActionsMenu';
import type { CockpitLifecycle } from './secretaryCockpitTypes';

/**
 * The header's status, with the class's values when no card says them (MYK9-1989): the status badge, then the class's facts,
 * expected start and actual timing. Editing them is Edit class.
 */
export function FocusedClassSummaryLine({
  lifecycle,
  parts,
}: {
  lifecycle: CockpitLifecycle | null;
  parts: readonly string[];
}) {
  return (
    <div
      className="flex min-w-0 flex-nowrap items-center gap-x-2 text-sm text-muted-foreground"
      data-testid="focused-class-summary"
    >
      <span className="shrink-0 whitespace-nowrap">
        <ClassStatusBadge lifecycle={lifecycle} />
      </span>
      {parts.length > 0 && (
        <span className="min-w-0 truncate" title={parts.join(' · ')}>
          {parts.join(' · ')}
        </span>
      )}
    </div>
  );
}

/**
 * The header's button (MYK9-2379): Edit class opens the one panel that holds every class setting
 * (status, judge, scoring, expected start, stewards, time limit).
 */
export function FocusedClassHeaderButtons({
  editClass,
  className,
}: {
  editClass: FocusedClassEditAction | undefined;
  className: string;
}) {
  return (
    <>
      {editClass && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={editClass.disabled}
          onClick={editClass.onSelect}
          aria-label={`Edit class ${className}`}
          className="min-h-11 gap-1.5 px-2.5"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit class
        </Button>
      )}
    </>
  );
}
