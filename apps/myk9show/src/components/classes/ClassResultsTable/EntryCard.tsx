import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { type EntryStatus, ENTRY_STATUS_CONFIG } from './entryStatusConfig';

export interface EntryCardEntry {
  entryId: string;
  armband: string;
  dogName: string;
  dogBreed: string;
  handlerName: string;
  status: EntryStatus;
}

interface EntryCardProps {
  entry: EntryCardEntry;
  scoringRoute: string;
}

export function EntryCard({ entry, scoringRoute }: EntryCardProps) {
  const navigate = useNavigate();
  const statusConfig = ENTRY_STATUS_CONFIG[entry.status];

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
          <span
            className={cn(
              'shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md',
              statusConfig.className
            )}
          >
            {statusConfig.icon && `${statusConfig.icon} `}
            {statusConfig.label}
          </span>
        </div>
        <div className="text-[13px] text-muted-foreground truncate">{entry.dogBreed}</div>
        <div className="text-xs text-muted-foreground/70 truncate">
          Handler: {entry.handlerName}
        </div>
      </div>
    </button>
  );
}
