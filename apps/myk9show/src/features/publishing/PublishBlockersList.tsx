import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FixItRow } from './FixItRow';
import {
  publishBlockerSentence,
  publishBlockerWaitingText,
  type PublishBlocker,
} from './publishBlockers';
import type { PublishBlockersState } from './usePublishBlockers';

export interface PublishBlockerFix {
  href?: string | undefined;
  onFix?: (() => void) | undefined;
}

interface PublishBlockersListProps {
  state: PublishBlockersState;
  /** Where each line is fixed; a line with no target is a statement (someone else's step). */
  fixFor: (blocker: PublishBlocker) => PublishBlockerFix | undefined;
  /** True when the viewer is the club admin, so a payouts line waiting on the club admin is theirs. */
  viewerIsClubAdmin: boolean;
}

const SECTION_CLASS = 'rounded-md border border-warning/40 bg-warning/10 p-3 text-sm';

/**
 * MYK9-2198: "Before you can publish", one row per line the server returns (or, in the wizard,
 * the same lines built from the draft), each opening the place to fix it. This is the ONE list:
 * the status pill, the Review step and "Show Created!" read it instead of pre-checking on their
 * own. Nothing renders for a ready show; an unreadable answer says so and offers a retry, never an
 * empty list that would read as "ready".
 */
export function PublishBlockersList({
  state,
  fixFor,
  viewerIsClubAdmin,
}: PublishBlockersListProps) {
  if (state.status === 'loading') return null;
  if (state.status === 'error') {
    return (
      <section
        aria-label="Before you can publish"
        data-testid="publish-blockers-error"
        className={SECTION_CLASS}
      >
        <p className="flex items-center gap-2 font-medium text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Could not check what blocks publishing. Try again.
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={state.retry}>
          Try again
        </Button>
      </section>
    );
  }
  if (state.blockers.length === 0) return null;
  return (
    <section
      aria-label="Before you can publish"
      data-testid="publish-blockers"
      className={SECTION_CLASS}
    >
      <p className="flex items-center gap-2 font-medium text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Before you can publish
      </p>
      <ul className="mt-2 space-y-1">
        {state.blockers.map(blocker => {
          const fix = fixFor(blocker);
          return (
            <FixItRow
              key={blocker.key}
              message={publishBlockerSentence(blocker)}
              href={fix?.href}
              onFix={fix?.onFix}
              note={publishBlockerWaitingText(blocker, viewerIsClubAdmin)}
            />
          );
        })}
      </ul>
    </section>
  );
}
