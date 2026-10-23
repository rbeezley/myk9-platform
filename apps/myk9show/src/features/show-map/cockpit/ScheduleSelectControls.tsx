import { Checkbox } from '@/components/ui/checkbox';

/** What a trial on the schedule needs from Select classes (MYK9-1324); absent outside the mode. */
export interface TrialGroupSelect {
  isSelected: (classId: string) => boolean;
  /** The trial heading's checkbox, over the trial's visible classes. */
  headingState: 'all' | 'some' | 'none';
  onToggleClass: (classId: string) => void;
  onToggleTrial: () => void;
  onOpenChange: (open: boolean) => void;
}

/** A class row's tick. The row's own click toggles it too, so this only renders the state. */
export function ScheduleRowCheckbox({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        aria-label={`Select ${label}`}
        className="h-5 w-5"
      />
    </span>
  );
}

/** The trial heading's select-all: every visible class of the trial, or none. */
export function ScheduleTrialCheckbox({
  label,
  state,
  onToggle,
}: {
  label: string;
  state: 'all' | 'some' | 'none';
  onToggle: () => void;
}) {
  return (
    <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center pl-2">
      <Checkbox
        checked={state === 'all'}
        indeterminate={state === 'some'}
        onCheckedChange={onToggle}
        aria-label={`Select every class in ${label}`}
        className="h-5 w-5"
      />
    </span>
  );
}
