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
  /** The wizard draft already holds a valid value for this line; only Save is left. */
  fixedInDraft?: boolean | undefined;
}

export const FIXED_IN_DRAFT_MESSAGE = 'Fixed in this draft. Save to apply.';

/** A part of the check that is not `ready` (the wizard's club read), shown as its own row. */
export type PublishBlockersPart = Exclude<PublishBlockersState, { state: 'ready' }>;

interface PublishBlockersListProps {
  state: PublishBlockersState;
  /** Where each line is fixed; a line with no target is a statement (someone else's step). */
  fixFor: (blocker: PublishBlocker) => PublishBlockerFix | undefined;
  /** True when the viewer is the club admin, so a payouts line waiting on the club admin is theirs. */
  viewerIsClubAdmin: boolean;
  /** The wizard's club part, when it is not ready: its own row, never folded into "ready". */
  clubPart?: PublishBlockersPart | undefined;
}

const SECTION_CLASS = 'rounded-md border border-warning/40 bg-warning/10 p-3 text-sm';

export const CHECKING_MESSAGE = 'Checking what blocks publishing…';
export const OFFLINE_MESSAGE = 'You are offline. Reconnect to see what blocks publishing.';
export const FAILED_MESSAGE = 'Could not check what blocks publishing. Try again.';
export const CLUB_CHECKING_MESSAGE = 'Checking the club’s approval and payouts…';
export const CLUB_OFFLINE_MESSAGE =
  'You are offline. Reconnect to check the club’s approval and payouts.';
export const CLUB_FAILED_MESSAGE = 'Could not check the club’s approval and payouts. Try again.';

function StatusSection({
  message,
  testId,
  retry,
}: {
  message: string;
  testId: string;
  retry?: (() => void) | undefined;
}) {
  return (
    <section aria-label="Before you can publish" data-testid={testId} className={SECTION_CLASS}>
      <p className="flex items-center gap-2 font-medium text-warning" role="status">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {message}
      </p>
      {retry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </section>
  );
}

function clubPartRow(part: PublishBlockersPart) {
  const message =
    part.state === 'checking'
      ? CLUB_CHECKING_MESSAGE
      : part.state === 'offline'
        ? CLUB_OFFLINE_MESSAGE
        : CLUB_FAILED_MESSAGE;
  return (
    <li className="flex flex-wrap items-center gap-x-2" data-testid="publish-blockers-club-part">
      <span>{message}</span>
      {part.state === 'failed' ? (
        <Button variant="outline" size="sm" onClick={part.retry}>
          Try again
        </Button>
      ) : null}
    </li>
  );
}

/**
 * MYK9-2198: "Before you can publish", one row per line the server returns (or, in the wizard,
 * the same lines built from the draft), each opening the place to fix it. This is the ONE list:
 * the status pill, the Review step and "Show Created!" read it instead of pre-checking on their
 * own. Every state is explicit: an unfinished or failed check never reads as "nothing blocks";
 * only a ready, empty list renders nothing.
 */
export function PublishBlockersList({
  state,
  fixFor,
  viewerIsClubAdmin,
  clubPart,
}: PublishBlockersListProps) {
  if (state.state === 'checking') {
    return <StatusSection message={CHECKING_MESSAGE} testId="publish-blockers-checking" />;
  }
  if (state.state === 'offline') {
    return <StatusSection message={OFFLINE_MESSAGE} testId="publish-blockers-offline" />;
  }
  if (state.state === 'failed') {
    return (
      <StatusSection message={FAILED_MESSAGE} testId="publish-blockers-error" retry={state.retry} />
    );
  }
  if (state.blockers.length === 0 && !clubPart) return null;
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
              message={fix?.fixedInDraft ? FIXED_IN_DRAFT_MESSAGE : publishBlockerSentence(blocker)}
              href={fix?.fixedInDraft ? undefined : fix?.href}
              onFix={fix?.fixedInDraft ? undefined : fix?.onFix}
              note={
                fix?.fixedInDraft ? null : publishBlockerWaitingText(blocker, viewerIsClubAdmin)
              }
            />
          );
        })}
        {clubPart ? clubPartRow(clubPart) : null}
      </ul>
    </section>
  );
}
