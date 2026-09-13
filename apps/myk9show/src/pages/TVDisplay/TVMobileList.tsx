import { TVMobileClassCard } from './TVMobileClassCard';
import { TVMobileResults } from './TVMobileResults';
import { TVEmptyState } from './TVEmptyState';
import type { TVClass, TVCompletedClass } from './types';

interface TVMobileListProps {
  classes: TVClass[];
  completedClasses: TVCompletedClass[];
  showName?: string;
  showId?: string;
  error?: Error | null;
}

export function TVMobileList({
  classes,
  completedClasses,
  showName,
  showId,
  error,
}: TVMobileListProps) {
  if (classes.length === 0 && completedClasses.length === 0) {
    return <TVEmptyState showName={showName} showId={showId} error={error} />;
  }

  return (
    <div className="pb-4 pt-2">
      {classes.map(c => (
        <TVMobileClassCard key={c.id} tvClass={c} />
      ))}
      {completedClasses.map(c => (
        <TVMobileResults key={c.id} completedClass={c} />
      ))}
    </div>
  );
}
