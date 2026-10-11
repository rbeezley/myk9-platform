/**
 * Set Max Time helpers shown before the judge types (MYK9-1101, from myK9Q): the
 * allowed range, and one-tap times every 30 seconds across it.
 */
import { Button } from '@/components/ui/button';
import { quickPickTimes, toMinutesSeconds } from './maxTimeInput';

export function MaxTimeQuickPicks({
  low,
  high,
  onPick,
}: {
  low: number;
  high: number;
  onPick: (seconds: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Allowed: {toMinutesSeconds(low)} to {toMinutesSeconds(high)}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick max times">
        {quickPickTimes(low, high).map(seconds => (
          <Button
            key={seconds}
            type="button"
            variant="outline"
            className="h-11 min-w-16"
            onClick={() => onPick(seconds)}
          >
            {toMinutesSeconds(seconds)}
          </Button>
        ))}
      </div>
    </div>
  );
}
