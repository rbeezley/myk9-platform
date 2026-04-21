import { Button } from '@/components/ui/button';
import { getCheckinStatusConfig } from '@myk9/core';

interface CheckInClassRowProps {
  entryId: string;
  className: string;
  checkInStatus: string;
  onCheckIn: (entryId: string) => void;
  checkedBySecretary?: boolean;
}

export function CheckInClassRow({
  entryId,
  className,
  checkInStatus,
  onCheckIn,
  checkedBySecretary = false,
}: CheckInClassRowProps) {
  const config = getCheckinStatusConfig(checkInStatus);
  const isNone = checkInStatus === 'no-status' || !checkInStatus;
  const colorVar = config?.colorVar ?? '--status-no-status';
  const label = config?.label ?? 'No Status';

  return (
    <div className="flex items-center justify-between rounded-md bg-background px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span
          data-testid="status-dot"
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: `var(${colorVar})` }}
        />
        {className}
      </div>

      {isNone ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onCheckIn(entryId)}
        >
          Check In
        </Button>
      ) : (
        <span className="text-xs" style={{ color: `var(${colorVar})` }}>
          {checkInStatus === 'checked-in'
            ? checkedBySecretary
              ? '✓ Secretary'
              : '✓ Self check-in'
            : label}
        </span>
      )}
    </div>
  );
}
