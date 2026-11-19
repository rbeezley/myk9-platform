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
import {
  useClubPublishBlockers,
  type PublishBlockersState,
} from '@/features/publishing/usePublishBlockers';
import type { FirstShowState } from './firstShowClub';

interface FirstShowCardProps {
  clubId: string;
  /** The server's answer for this club (club_first_show_state). */
  firstShow: FirstShowState;
}

/**
 * MYK9-2199: "Get your first show published", shown on the secretary's home page until her
 * club has published a show (clubs.first_show_published_at, read through club_first_show_state, so
 * it stays gone after a later unpublish). The lines are the server's club list (club_publish_blockers),
 * read through the same hook and list the wizard uses, so offline and failed checks read the same.
 */
export function FirstShowCard({ clubId, firstShow }: FirstShowCardProps) {
  const blockers = useClubPublishBlockers(clubId);
  const canOpenPayments = useCanOpenClubPayments(clubId);
  if (firstShow.state === 'ready' && firstShow.publishedEver) return null;

  const fixFor = (blocker: PublishBlocker): PublishBlockerFix | undefined =>
    blocker.key === 'payouts_not_enabled' && canOpenPayments
      ? { href: clubPaymentsHref(clubId) }
      : undefined;

  // Until the first-show answer is in, the list shows that state (checking, offline, could
  // not check) instead of blockers: nothing here may read as "all clear".
  const listState: PublishBlockersState =
    firstShow.state === 'ready'
      ? blockers
      : firstShow.state === 'failed'
        ? { state: 'failed', blockers: [], retry: firstShow.retry }
        : { state: firstShow.state, blockers: [] };

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
        <PublishBlockersList
          state={listState}
          fixFor={fixFor}
          viewerIsClubAdmin={canOpenPayments}
        />
        {listState.state === 'ready' && listState.blockers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is holding your club back. Publish your show when it is ready.
          </p>
        ) : null}
      </div>
      {firstShow.state === 'ready' ? (
        <Button asChild className="mt-3 min-h-11">
          {firstShow.draftShowId ? (
            <Link to={`/shows/${firstShow.draftShowId}`}>Continue your draft show</Link>
          ) : (
            <Link to={`/secretary/create-show/wizard?clubId=${clubId}`}>
              Create your first show
            </Link>
          )}
        </Button>
      ) : null}
    </section>
  );
}
