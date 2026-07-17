import { Button } from '@/components/ui/button';
import { StatusIcon, getStatusDescriptor } from '@/components/status';

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
  const isNone = checkInStatus === 'no-status' || !checkInStatus;
  const descriptor = getStatusDescriptor('entry', checkInStatus);

  return (
    <div className="flex items-center justify-between rounded-md bg-background px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <StatusIcon family="entry" status={checkInStatus} size="sm" decorative />
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
        <span className="inline-flex items-center gap-1 text-xs text-foreground">
          {checkInStatus === 'checked-in'
            ? checkedBySecretary
              ? '✓ Secretary'
              : '✓ Self check-in'
            : descriptor.label}
        </span>
      )}
    </div>
  );
}
