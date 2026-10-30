import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PendingClass } from './resultsClassFilters';

function statusText(cls: PendingClass): string {
  if (cls.scoredCount === 0) return 'Not scored yet';
  return `${cls.scoredCount} scored, awaiting release`;
}

/** Classes with no podium yet, always visible so a novice can tell "not done" from "missing". */
export function PendingClassesList({ classes }: { classes: PendingClass[] }) {
  if (classes.length === 0) return null;

  return (
    <section className="rounded-lg border" aria-labelledby="pending-classes-heading">
      <h3
        id="pending-classes-heading"
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground"
      >
        <Clock className="h-4 w-4" aria-hidden="true" />
        Pending classes
        <Badge variant="outline" className="ml-auto">
          {classes.length}
        </Badge>
      </h3>
      <ul className="divide-y border-t px-4">
        {classes.map(cls => (
          <li key={cls.classId} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{cls.className}</span>
            <span className="text-muted-foreground">{statusText(cls)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
