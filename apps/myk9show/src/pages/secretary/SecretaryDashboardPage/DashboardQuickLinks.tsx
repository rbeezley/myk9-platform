import { Link } from 'react-router-dom';
import { Dog, Plus, UserPlus } from 'lucide-react';

const QUICK_LINKS = [
  {
    label: 'Add Show',
    description: 'Start the wizard',
    href: '/secretary/create-show/wizard',
    Icon: Plus,
  },
  {
    label: 'Add Dog',
    description: 'Open dogs',
    href: '/dogs',
    Icon: Dog,
  },
  {
    label: 'Add Person',
    description: 'Open people',
    href: '/people',
    Icon: UserPlus,
  },
] as const;

export function DashboardQuickLinks() {
  return (
    <nav className="px-5 pb-3" aria-label="Dashboard quick links">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {QUICK_LINKS.map(({ label, description, href, Icon }) => (
          <Link
            key={href}
            to={href}
            className="flex min-h-16 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-tight text-foreground">
                {label}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
