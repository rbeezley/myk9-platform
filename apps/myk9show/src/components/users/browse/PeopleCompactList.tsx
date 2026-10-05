import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
 *
 * Up/Down while a row has focus moves to the previous/next person and opens them, so a list can be
 * worked through from the keyboard. It replaces history entries rather than adding one per press.
 */
export const PeopleCompactList: React.FC<PeopleCompactListProps> = ({ people, selectedId }) => {
  const navigate = useNavigate();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    // Cmd+Down, Alt+Up and the like belong to the browser and the OS.
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const rows = Array.from(event.currentTarget.querySelectorAll('a'));
    const from = rows.indexOf((event.target as HTMLElement).closest('a') as HTMLAnchorElement);
    const to = from + (event.key === 'ArrowDown' ? 1 : -1);
    const next = people[to];
    if (from === -1 || !next) return;
    event.preventDefault();
    rows[to]?.focus();
    navigate(`/people/${next.id}`, { replace: true });
  };

  const opened = people.find(person => person.id === selectedId);

  return (
    <>
      {/* Focus stays on the list row, so the right pane changing is otherwise silent. */}
      <p role="status" className="sr-only">
        {opened ? `Showing details for ${extractPersonName(opened).fullName}` : ''}
      </p>
      <ul
        className="divide-y divide-border rounded-lg border bg-card"
        aria-label="People"
        onKeyDown={handleKeyDown}
      >
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
                  {[person.email, (person.roles ?? []).join(', ')].filter(Boolean).join(' · ') ||
                    '—'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
};

export default PeopleCompactList;
