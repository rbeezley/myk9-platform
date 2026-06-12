import { NavLink, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Setup', path: 'setup' },
  { label: 'Show Desk', path: 'show-desk' },
  { label: 'Entry Management', path: 'entry-management' },
  { label: 'Reports', path: 'reports' },
  { label: 'Results Control', path: 'results-control' },
  { label: 'Submit Results', path: 'submit-results' },
] as const;

export function ShowContextNav() {
  const { id, showId } = useParams<{ id?: string; showId?: string }>();
  const resolvedShowId = showId ?? id;

  if (!resolvedShowId) return null;

  return (
    <nav
      className="border-b border-border bg-background"
      aria-label="Show sections"
      data-testid="show-context-nav"
    >
      <div className="flex overflow-x-auto px-4 sm:px-6">
        {NAV_ITEMS.map(({ label, path }) => {
          const to = `/shows/${resolvedShowId}/${path}`;
          return (
            <NavLink
              key={path}
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  'shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )
              }
            >
              {label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
