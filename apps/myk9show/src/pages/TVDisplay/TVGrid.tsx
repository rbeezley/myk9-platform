import { cn } from '@/lib/utils';
import { TVClassCard } from './TVClassCard';
import { TVEmptyState } from './TVEmptyState';
import { TVMobileResults } from './TVMobileResults';
import type { TVClass, TVCompletedClass } from './types';

interface TVGridProps {
  classes: TVClass[];
  completedClasses?: TVCompletedClass[];
  highlightedClassId?: string | null;
  showName?: string;
  showId?: string;
  error?: Error | null;
}

export function TVGrid({
  classes,
  completedClasses = [],
  highlightedClassId,
  showName,
  showId,
  error,
}: TVGridProps) {
  if (classes.length === 0 && completedClasses.length === 0) {
    return <TVEmptyState showName={showName} showId={showId} error={error} />;
  }

  return (
    <>
      {classes.length > 0 && (
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
      )}
      {completedClasses.length > 0 && (
        <section
          aria-label="Completed classes"
          className={cn('p-4', completedClasses.length === 1 && 'mx-auto max-w-lg')}
        >
          <h2 className="mb-3 text-lg font-semibold text-zinc-200">Completed classes</h2>
          <div
            className={cn(
              'grid gap-4',
              completedClasses.length === 1
                ? 'grid-cols-1'
                : completedClasses.length === 2
                  ? 'md:grid-cols-2'
                  : 'md:grid-cols-2 xl:grid-cols-3'
            )}
          >
            {completedClasses.map(completedClass => (
              <TVMobileResults key={completedClass.id} completedClass={completedClass} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
