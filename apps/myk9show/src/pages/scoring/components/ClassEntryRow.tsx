import { cn } from '@/lib/utils';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import type { ScoringEntry } from '../types';

const RESULT_BADGE: Record<string, { label: string; className: string }> = {
  Qualified: { label: 'Q', className: 'bg-teal-100 text-teal-700' },
  'Not Qualified': {
    label: 'NQ',
    className: 'bg-amber-100 text-amber-700',
  },
  Absent: { label: 'ABS', className: 'bg-muted text-muted-foreground' },
  Excused: { label: 'EX', className: 'bg-muted text-muted-foreground' },
  Withdrawn: { label: 'WD', className: 'bg-muted text-muted-foreground' },
};

interface ClassEntryRowProps {
  entry: ScoringEntry;
  isActive: boolean;
  showPlacement?: boolean;
  onClick: () => void;
}

function formatTime(milliseconds: number): string {
  if (milliseconds <= 0) return 'Time missing';
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.round((totalSeconds % 1) * 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function formatFaults(faults: number): string {
  return `${faults} fault${faults === 1 ? '' : 's'}`;
}

function formatPlacement(placement: number): string {
  if (placement === 1) return '1st';
  if (placement === 2) return '2nd';
  if (placement === 3) return '3rd';
  return `${placement}th`;
}

function getResultDetails(entry: ScoringEntry): string | null {
  const result = entry.result;
  if (!result) return null;

  if (result.qualification === 'Qualified') {
    return `${formatTime(result.time)} · ${formatFaults(result.faults)}`;
  }

  if (result.qualification === 'Not Qualified' || result.qualification === 'Excused') {
    return result.reason ? result.reason : 'Reason missing';
  }

  return null;
}

export function ClassEntryRow({
  entry,
  isActive,
  showPlacement = false,
  onClick,
}: ClassEntryRowProps) {
  const badge = entry.result ? RESULT_BADGE[entry.result.qualification] : undefined;
  const resultDetails = getResultDetails(entry);
  const placement = showPlacement ? entry.placement : undefined;

  return (
    <button
      onClick={onClick}
      data-active={isActive}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
        isActive ? 'bg-info/10 border border-info/30 ' : 'hover:bg-accent'
      )}
    >
      <ArmbandBadge armband={entry.armband} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{entry.callName}</div>
        <div className="text-xs text-muted-foreground truncate">{entry.breed}</div>
        <div className="text-xs text-muted-foreground truncate">{entry.handler}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          {placement && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {formatPlacement(placement)}
            </span>
          )}
          {badge && (
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', badge.className)}>
              {badge.label}
            </span>
          )}
        </div>
        {resultDetails && (
          <span className="max-w-44 truncate text-xs text-muted-foreground">{resultDetails}</span>
        )}
      </div>
    </button>
  );
}
