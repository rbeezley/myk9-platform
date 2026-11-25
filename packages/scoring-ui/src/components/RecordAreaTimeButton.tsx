import { Button } from '@myk9/ui';
import { ClipboardCheck } from 'lucide-react';

/** Multi-area: copy the stopped clock into the area it timed (MYK9-1098). */
export function RecordAreaTimeButton({
  areaNames,
  timedArea,
  isRunning,
  elapsedMs,
  formatTime,
  onRecord,
}: {
  areaNames: string[];
  timedArea: number;
  isRunning: boolean;
  elapsedMs: number;
  /** The stopwatch's own formatter, so this matches the clock face. */
  formatTime: (ms: number) => string;
  onRecord: () => void;
}) {
  if (areaNames.length < 2 || isRunning || elapsedMs === 0) return null;
  const areaName = areaNames[timedArea];
  return (
    <Button
      className="h-12 w-full rounded-xl text-base font-semibold"
      onClick={onRecord}
      data-testid="timer-record-area"
    >
      <ClipboardCheck className="size-5 shrink-0" aria-hidden="true" />
      <span className="truncate">
        Record {formatTime(elapsedMs)} to {areaName ?? 'area'}
      </span>
    </Button>
  );
}
