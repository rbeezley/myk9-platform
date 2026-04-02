import { TVMobileClassCard } from './TVMobileClassCard';
import { TVMobileResults } from './TVMobileResults';
import type { TVClass, TVCompletedClass } from './types';

interface TVMobileListProps {
  classes: TVClass[];
  completedClasses: TVCompletedClass[];
}

export function TVMobileList({ classes, completedClasses }: TVMobileListProps) {
  if (classes.length === 0 && completedClasses.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-zinc-500 text-sm">
        No classes currently in progress
      </div>
    );
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
