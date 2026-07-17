import { ClipboardCheck, Pencil, X, CheckCircle2 } from 'lucide-react';
import { CHECKIN_STATUSES, type CheckInStatus } from '@myk9/core';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/base/Chip';
import { StatusIcon, getStatusDescriptor } from '@/components/status';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PlacementPill } from '@/components/base/PlacementPill';
import type { RunSheetEntry } from './types';

interface RunSheetRowProps {
  entry: RunSheetEntry;
  onScoreEntry: () => void;
  onCheckInStatus: (status: CheckInStatus) => void;
  isMine?: boolean;
}

function statusLabel(status: CheckInStatus): string {
  return getStatusDescriptor('entry', status).label;
}

// INTENT: Row identity + check-in select + score button. The drag handle
// and SortableCard scaffolding that used to live here moved to Show Map
// when B7 took over operational reorder (see SecretaryRunSheet index for
// the "Reorder in Show Map" link).
export function RunSheetRow({
  entry,
  onScoreEntry,
  onCheckInStatus,
  isMine = false,
}: RunSheetRowProps) {
  const { isScored, isScratched, result } = entry;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border bg-card transition-opacity',
        isScored && 'border-green-200',
        isScratched && 'border-destructive/20 opacity-60',
        !isScored && !isScratched && (isMine ? 'border-primary/50' : 'border-border')
      )}
    >
      <div className="grid min-h-[92px] grid-cols-[64px_minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-4">
        <div
          className={cn(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-lg font-bold text-primary-foreground shadow-sm',
            isScratched && 'bg-destructive/80'
          )}
        >
          {entry.armband || '-'}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-base font-bold text-foreground">{entry.dogName}</span>
            {isMine && (
              <Chip color="purple" size="sm">
                Your dog
              </Chip>
            )}
          </div>
          <div className="mt-1 space-y-0.5">
            <p className="truncate text-sm text-muted-foreground">
              {entry.breed ?? 'Unknown breed'}
            </p>
            {entry.handlerName && (
              <p className="truncate text-sm text-muted-foreground">{entry.handlerName}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isScored && result && (
            <>
              <Chip
                color={result.qualified ? 'green' : 'red'}
                size="sm"
                leadingIcon={result.qualified ? <CheckCircle2 size={12} /> : <X size={12} />}
              >
                {result.qualified ? 'Qualified' : 'NQ'}
              </Chip>
              {result.timeStr && (
                <span className="font-mono text-sm font-bold text-foreground">
                  {result.timeStr}
                </span>
              )}
              {result.placement && <PlacementPill placement={result.placement} size="sm" />}
            </>
          )}
          <Select
            value={entry.checkInStatus}
            onValueChange={value => onCheckInStatus(value as CheckInStatus)}
          >
            <SelectTrigger
              aria-label={`Check-in status for ${entry.dogName}`}
              className="h-11 min-w-[148px] rounded-full border bg-background font-semibold text-foreground"
            >
              <StatusIcon
                family="entry"
                status={entry.checkInStatus}
                size="sm"
                decorative
              />
              <span>{statusLabel(entry.checkInStatus)}</span>
            </SelectTrigger>
            <SelectContent>
              {CHECKIN_STATUSES.map(status => (
                <SelectItem key={status} value={status}>
                  {statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {!isScratched && (
            <Button
              size="sm"
              variant={isScored ? 'outline' : 'default'}
              onClick={onScoreEntry}
              className="gap-1.5"
            >
              {isScored ? (
                <>
                  <Pencil size={13} /> Edit result
                </>
              ) : (
                <>
                  <ClipboardCheck size={13} /> Enter result
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
