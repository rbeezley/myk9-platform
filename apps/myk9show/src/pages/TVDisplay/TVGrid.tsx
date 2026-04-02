import { cn } from '@/lib/utils';
import { TVClassCard } from './TVClassCard';
import type { TVClass } from './types';

interface TVGridProps {
  classes: TVClass[];
  highlightedClassId?: string | null;
}

export function TVGrid({ classes, highlightedClassId }: TVGridProps) {
  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-zinc-500">
        <div className="text-lg">No classes currently in progress</div>
      </div>
    );
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
