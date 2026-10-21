import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListEmptyState } from '@/components/list-toolkit';
import { ADD_YOUR_CLUB, CREATE_ACCOUNT } from '@/components/landing/lifecycle/landingCtas';
import { useAuthContext } from '@/hooks/useAuthContext';

const SHOW_NOUN = ['show', 'shows'] as const;

// Signed in: how the list fills, and where to look.
const SHOWS_EMPTY_SIGNED_IN =
  'Shows will appear here as they are added. Try searching by discipline or club name above.';
// Signed out: the homepage's "Find a show" lands here, so it must offer a next step.
const PAST_TITLE = 'Nothing coming up';
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
  past,
  onShowPast,
}: {
  filtered: boolean;
  onShowAll: () => void;
  /** Nothing is upcoming but past shows exist (MYK9-1283): say so instead of "No shows yet". */
  past?: { count: number; monthLabel: string };
  onShowPast?: () => void;
}) {
  const { user } = useAuthContext();
  const pastDescription =
    past && !filtered ? (
      <>
        No upcoming shows. {past.count} past {past.count === 1 ? 'show' : 'shows'}: see{' '}
        <Button variant="link" className="h-auto p-0 align-baseline" onClick={onShowPast}>
          {past.monthLabel}
        </Button>
        .
      </>
    ) : null;
  if (user || filtered) {
    return (
      <ListEmptyState
        icon={Search}
        noun={SHOW_NOUN}
        filtered={filtered}
        onShowAll={onShowAll}
        description={pastDescription ?? SHOWS_EMPTY_SIGNED_IN}
        {...(pastDescription ? { title: PAST_TITLE } : {})}
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
      description={pastDescription ?? SHOWS_EMPTY_GUEST}
      {...(pastDescription ? { title: PAST_TITLE } : {})}
      action={{ label: CREATE_ACCOUNT.label, href: CREATE_ACCOUNT.to }}
      secondaryAction={{ label: ADD_YOUR_CLUB.label, href: `/${ADD_YOUR_CLUB.href}` }}
    />
  );
}
