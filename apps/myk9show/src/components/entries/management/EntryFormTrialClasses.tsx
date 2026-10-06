import { cn } from '@/lib/utils';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { summarizeTrialClasses } from './entryFormTrialSummary';

/**
 * Which trial and class an entry form is for, under the dog names in the queue. One line per
 * trial ("Sat, Nov 9 · Trial 1  Container Novice A, Interior Novice A"), the first two trials, then
 * how many classes did not fit; the focused pane lists every entry.
 */
export function EntryFormTrialClasses({
  entries,
  truncate,
  className,
}: {
  entries: readonly EntryManagementEntry[];
  truncate: boolean;
  className?: string;
}) {
  const { lines, hiddenClassCount } = summarizeTrialClasses(entries);
  if (lines.length === 0) return null;

  return (
    <div className={cn('min-w-0 space-y-0.5 text-xs text-muted-foreground', className)}>
      {lines.map(line => (
        <p key={line.key} className={cn(truncate && 'truncate')}>
          {line.label && <span className="font-medium text-foreground/80">{line.label}</span>}
          {line.label && line.classes.length > 0 && ' · '}
          {line.classes.join(', ')}
        </p>
      ))}
      {hiddenClassCount > 0 && <p>+{hiddenClassCount} more</p>}
    </div>
  );
}
