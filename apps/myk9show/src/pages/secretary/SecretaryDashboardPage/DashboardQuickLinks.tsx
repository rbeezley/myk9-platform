import { Link } from 'react-router-dom';
import { Dog, Plus, UserPlus } from 'lucide-react';

const QUICK_LINKS = [
  {
    label: 'Add Show',
    href: '/secretary/create-show/wizard',
    Icon: Plus,
  },
  {
    label: 'Add Dog',
    href: '/dogs?add=true',
    Icon: Dog,
  },
  {
    label: 'Add Person',
    href: '/people?add=true',
    Icon: UserPlus,
  },
] as const;

export function DashboardQuickLinks() {
  return (
    <nav className="px-5 pb-3" aria-label="Dashboard quick links">
      <div data-testid="dashboard-quick-links-row" className="grid grid-cols-3 gap-2">
        {QUICK_LINKS.map(({ label, href, Icon }) => (
          <Link
            key={href}
            to={href}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
