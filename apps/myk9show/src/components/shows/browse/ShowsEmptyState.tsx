import { Search } from 'lucide-react';
import { ListEmptyState } from '@/components/list-toolkit';
import { ADD_YOUR_CLUB, CREATE_ACCOUNT } from '@/components/landing/lifecycle/landingCtas';
import { useAuthContext } from '@/hooks/useAuthContext';

const SHOW_NOUN = ['show', 'shows'] as const;

// Signed in: how the list fills, and where to look.
const SHOWS_EMPTY_SIGNED_IN =
  'Shows will appear here as they are added. Try searching by discipline or club name above.';
// Signed out: the homepage's "Find a show" lands here, so it must offer a next step.
const SHOWS_EMPTY_GUEST = 'Shows appear here as clubs publish them.';

/**
 * The empty Browse Shows list (MYK9-1152). A filtered list keeps the shared "No shows match"
 * state. A signed-out visitor, who arrives from the homepage's "Find a show", gets the
 * homepage's own next steps: a free account (exhibitors) or adding their club. Labels come
 * from the landing CTA constants so both pages say the same thing.
 */
export function ShowsEmptyState({
  filtered,
  onShowAll,
}: {
  filtered: boolean;
  onShowAll: () => void;
}) {
  const { user } = useAuthContext();
  if (user || filtered) {
    return (
      <ListEmptyState
        icon={Search}
        noun={SHOW_NOUN}
        filtered={filtered}
        onShowAll={onShowAll}
        description={SHOWS_EMPTY_SIGNED_IN}
        action={null}
      />
    );
  }
  return (
    <ListEmptyState
      icon={Search}
      noun={SHOW_NOUN}
      filtered={false}
      onShowAll={onShowAll}
      description={SHOWS_EMPTY_GUEST}
      action={{ label: CREATE_ACCOUNT.label, href: CREATE_ACCOUNT.to }}
      secondaryAction={{ label: ADD_YOUR_CLUB.label, href: `/${ADD_YOUR_CLUB.href}` }}
    />
  );
}
