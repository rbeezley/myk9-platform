import { NavLink, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SHOW_MANAGEMENT_NAV_SECTIONS } from '@/routes/showManagementSections';

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
      <div className="flex max-w-full overflow-x-auto no-scrollbar px-4 sm:px-6">
        {SHOW_MANAGEMENT_NAV_SECTIONS.map(({ label, path }) => {
          const to = `/shows/${resolvedShowId}/${path}`;
          return (
            <NavLink
              key={path}
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  'min-h-11 shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
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
