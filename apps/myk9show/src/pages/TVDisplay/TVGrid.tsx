import { cn } from '@/lib/utils';
import { TVClassCard } from './TVClassCard';
import { TVEmptyState } from './TVEmptyState';
import type { TVClass } from './types';

interface TVGridProps {
  classes: TVClass[];
  highlightedClassId?: string | null;
  showName?: string;
  showId?: string;
  error?: Error | null;
}

export function TVGrid({ classes, highlightedClassId, showName, showId, error }: TVGridProps) {
  if (classes.length === 0) {
    return <TVEmptyState showName={showName} showId={showId} error={error} />;
  }

  return (
    <div
      className={cn(
        'grid gap-4 p-4',
        classes.length === 1
          ? 'grid-cols-1 max-w-lg mx-auto'
          : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
      )}
    >
      {classes.map(tvClass => (
        <TVClassCard
          key={tvClass.id}
          tvClass={tvClass}
          highlighted={tvClass.id === highlightedClassId}
        />
      ))}
    </div>
  );
}
