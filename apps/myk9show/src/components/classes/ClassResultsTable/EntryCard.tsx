import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import type { CheckInStatus } from '@myk9/core';

export interface EntryCardEntry {
  entryId: string;
  armband: string;
  dogName: string;
  dogBreed: string;
  handlerName: string;
  status: CheckInStatus;
}

interface EntryCardProps {
  entry: EntryCardEntry;
  scoringRoute: string;
  onStatusClick?: ((entry: EntryCardEntry) => void) | undefined;
}

export function EntryCard({ entry, scoringRoute, onStatusClick }: EntryCardProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(scoringRoute)}
      className={cn(
        'w-full text-left bg-card rounded-xl border border-border p-4',
        'flex items-start gap-3.5 cursor-pointer',
        'transition-colors hover:border-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <ArmbandBadge armband={entry.armband} className="size-12 rounded-[10px] text-lg" />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <span className="font-semibold text-[15px] text-foreground truncate">
            {entry.dogName}
          </span>
          <CheckInStatusBadge
            status={entry.status}
            size="sm"
            {...(onStatusClick != null && { onClick: () => onStatusClick(entry) })}
          />
        </div>
        <div className="text-[13px] text-muted-foreground truncate">{entry.dogBreed}</div>
        <div className="text-xs text-muted-foreground/70 truncate">
          Handler: {entry.handlerName}
        </div>
      </div>
    </button>
  );
}
