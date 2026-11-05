import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { NavGroup, Section } from './AccountPage.types';

// MYK9-1717: on a phone the account sections are a list of full-width rows,
// like the phone's own Settings app. The old sideways-scrolling tab strip hid
// Notifications and Security off-screen with nothing to say they were there.
// INTENT: every section is visible at once on a phone; nothing to swipe for.

/** Media query for the phone layout; `md` (768px) and up keeps the sidebar. */
export const ACCOUNT_PHONE_QUERY = '(max-width: 767px)';

interface AccountSectionListProps {
  groups: NavGroup[];
  onSelect: (section: Section) => void;
}

export function AccountSectionList({ groups, onSelect }: AccountSectionListProps) {
  return (
    <nav aria-label="Account sections" className="space-y-5">
      {groups.map(group => (
        <section key={group.label} aria-label={group.label}>
          {/* A heading that only repeats its one row ("Security" over Security) is noise. */}
          {!(group.items.length === 1 && group.items[0].label === group.label) && (
            <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h2>
          )}
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {group.items.map(({ key, label, icon: Icon }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  className={`flex min-h-14 w-full items-center gap-3 px-4 text-left text-base transition-colors hover:bg-muted ${
                    key === 'delete' ? 'text-destructive' : 'text-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{label}</span>
                  <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

interface AccountSectionBackProps {
  onBack: () => void;
}

export function AccountSectionBack({ onBack }: AccountSectionBackProps) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back to Account"
      className="-ml-2 mb-2 flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:bg-muted"
    >
      <ChevronLeft aria-hidden className="h-5 w-5" />
      Account
    </button>
  );
}
