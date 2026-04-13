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
  onClick: () => void;
}

export function ClassEntryRow({ entry, isActive, onClick }: ClassEntryRowProps) {
  const badge = entry.result ? RESULT_BADGE[entry.result.qualification] : undefined;

  return (
    <button
      onClick={onClick}
      data-active={isActive}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
        isActive
          ? 'bg-blue-50 border border-blue-300 dark:bg-blue-950 dark:border-blue-700'
          : 'hover:bg-accent',
        entry.isScored && !isActive && 'opacity-50'
      )}
    >
      <ArmbandBadge armband={entry.armband} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{entry.callName}</div>
        <div className="text-xs text-muted-foreground truncate">{entry.handler}</div>
      </div>
      {badge && (
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', badge.className)}>
          {badge.label}
        </span>
      )}
    </button>
  );
}
