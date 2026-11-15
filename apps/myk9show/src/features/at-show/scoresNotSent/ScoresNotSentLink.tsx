import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { scoresNotSentPath, type ScoresNotSentLinkState } from './scoresNotSentModel';

/**
 * A count that opens "Scores not sent" (MYK9-2011). Every place that counts unsent scores wraps
 * its count in this, so tapping any of them reaches the one list. 44px tall for a gloved tap.
 */
export function ScoresNotSentLink({
  showId,
  from,
  className,
  children,
}: {
  showId: string;
  /** The screen the count is on, so the list's Up returns there. */
  from: ScoresNotSentLinkState['scoresNotSentFrom'];
  className?: string | undefined;
  children: ReactNode;
}) {
  const state: ScoresNotSentLinkState = { scoresNotSentFrom: from };
  return (
    <Link
      to={scoresNotSentPath(showId)}
      state={state}
      data-testid="scores-not-sent-link"
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-md underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {children}
    </Link>
  );
}
