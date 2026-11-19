import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  clubPaymentsHref,
  useCanOpenClubPayments,
} from '@/features/payments/useCanOpenClubPayments';
import {
  PublishBlockersList,
  type PublishBlockerFix,
} from '@/features/publishing/PublishBlockersList';
import type { PublishBlocker } from '@/features/publishing/publishBlockers';
import { useClubPublishBlockers } from '@/features/publishing/usePublishBlockers';

interface FirstShowCardProps {
  clubId: string;
  /** The club's draft show, when it already has one. */
  draftShowId?: string | undefined;
}

/**
 * MYK9-2199: "Get your first show published", shown on the secretary's home page until her
 * club has a public show. The lines are the server's club list (club_publish_blockers), read
 * through the same hook and list the wizard uses, so offline and failed checks read the same.
 */
export function FirstShowCard({ clubId, draftShowId }: FirstShowCardProps) {
  const state = useClubPublishBlockers(clubId);
  const canOpenPayments = useCanOpenClubPayments(clubId);

  const fixFor = (blocker: PublishBlocker): PublishBlockerFix | undefined =>
    blocker.key === 'payouts_not_enabled' && canOpenPayments
      ? { href: clubPaymentsHref(clubId) }
      : undefined;

  return (
    <section
      aria-label="Get your first show published"
      data-testid="first-show-card"
      className="mx-5 mb-3 rounded-lg border bg-card p-4"
    >
      <h2 className="text-base font-semibold">Get your first show published</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Publishing makes your show visible, and exhibitors can enter once entries open. Here is what
        is left for your club.
      </p>
      <div className="mt-3">
        <PublishBlockersList state={state} fixFor={fixFor} viewerIsClubAdmin={canOpenPayments} />
        {state.state === 'ready' && state.blockers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is holding your club back. Publish your show when it is ready.
          </p>
        ) : null}
      </div>
      <Button asChild className="mt-3 min-h-11">
        {draftShowId ? (
          <Link to={`/shows/${draftShowId}`}>Continue your draft show</Link>
        ) : (
          <Link to={`/secretary/create-show/wizard?clubId=${clubId}`}>Create your first show</Link>
        )}
      </Button>
    </section>
  );
}
