import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { extractPersonName } from '@/components/users/UserDetails/userDetailsTypes';
import type { User } from '@/types/user-types';

interface PeopleCompactListProps {
  people: User[];
  /** The person open in the detail pane, if any. */
  selectedId: string | undefined;
}

/**
 * One line per person, for the left pane of the People master-detail layout. The full table
 * needs ~720px; this fits a narrow pane. Rows are links, so open-in-new-tab and the back button
 * behave as they do everywhere else.
 */
export const PeopleCompactList: React.FC<PeopleCompactListProps> = ({ people, selectedId }) => (
  <ul className="divide-y divide-border rounded-lg border bg-card" aria-label="People">
    {people.map(person => {
      const { fullName } = extractPersonName(person);
      const selected = person.id === selectedId;
      return (
        <li key={person.id}>
          <Link
            to={`/people/${person.id}`}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'flex min-h-14 flex-col justify-center px-3 py-2 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
              selected && 'bg-primary/10 hover:bg-primary/10'
            )}
          >
            <span className="truncate text-sm font-medium">{fullName}</span>
            <span className="truncate text-xs text-muted-foreground">
              {[person.email, (person.roles ?? []).join(', ')].filter(Boolean).join(' · ') || '—'}
            </span>
          </Link>
        </li>
      );
    })}
  </ul>
);

export default PeopleCompactList;
