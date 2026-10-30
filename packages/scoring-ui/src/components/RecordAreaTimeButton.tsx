import { Button } from '@myk9/ui';

/** Multi-area: copy the stopped clock into the area it timed (MYK9-1098). */
export function RecordAreaTimeButton({
  areaNames,
  timedArea,
  isRunning,
  elapsedMs,
  onRecord,
}: {
  areaNames: string[];
  timedArea: number;
  isRunning: boolean;
  elapsedMs: number;
  onRecord: () => void;
}) {
  if (areaNames.length < 2 || isRunning || elapsedMs === 0) return null;
  const areaName = areaNames[timedArea];
  return (
    <Button
      variant="outline"
      className="h-12 w-full rounded-xl"
      onClick={onRecord}
      data-testid="timer-record-area"
    >
      Record {areaName ?? 'area'} time
    </Button>
  );
}
