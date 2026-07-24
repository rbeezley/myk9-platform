import { ChevronRight, Clock3, Star, User } from 'lucide-react';
import { getEffectiveClassStatus, type ClassEntry } from '@myk9/ringside';
import { StatusBadge } from '@/components/status';
import { cn } from '@/lib/utils';
import { formatAtShowClassTime } from './atShowClassTiming';

interface AtShowClassRowProps {
  entry: ClassEntry;
  isExhibitorOnly: boolean;
  onClick: (entry: ClassEntry) => void;
  trialTimeZone: string;
}

export function AtShowClassRow({
  entry,
  isExhibitorOnly,
  onClick,
  trialTimeZone,
}: AtShowClassRowProps) {
  const status = getEffectiveClassStatus(entry);

  return (
    <li>
      {/* INTENT: in-ring gloved taps want ~48px rows — hence min-h-12. */}
      <button
        type="button"
        onClick={() => onClick(entry)}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.99]',
          // #923 tokenized the favorite (theme-aware, calm in dark).
          entry.is_favorite && 'border-primary bg-primary/5'
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {entry.is_favorite && (
              <Star size={15} className="shrink-0 fill-primary text-primary" />
            )}
            <span className="truncate font-medium">{entry.class_name}</span>
          </div>
          {entry.judge_name && entry.judge_name !== 'No Judge Assigned' && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
              <User size={13} className="shrink-0" />
              {entry.judge_name}
            </div>
          )}
          {entry.start_time && (
            <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Clock3 size={13} className="shrink-0" aria-hidden />
              {entry.revised_expected_start ? 'Expected' : 'Scheduled'}{' '}
              {formatAtShowClassTime(entry.start_time, trialTimeZone)}
            </div>
          )}
          {!isExhibitorOnly && entry.actual_start_time && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Started {formatAtShowClassTime(entry.actual_start_time, trialTimeZone)}
              {entry.actual_end_time
                ? ` · Finished ${formatAtShowClassTime(entry.actual_end_time, trialTimeZone)}`
                : ''}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge
            family="class"
            status={status}
            className="px-2 py-0.5 text-xs font-medium"
          />
          <span className="text-xs text-muted-foreground">
            {entry.completed_count} / {entry.entry_count}
          </span>
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}
