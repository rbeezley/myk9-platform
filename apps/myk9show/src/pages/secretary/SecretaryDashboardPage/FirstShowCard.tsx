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
import { useClubQuery } from '@/hooks/queries/useClubsDatabase';
import { useClubPublishBlockers } from '@/features/publishing/usePublishBlockers';

interface FirstShowCardProps {
  clubId: string;
  /** The club's newest draft show (club_first_show_state), when it has one. */
  draftShowId: string | null;
}

/**
 * MYK9-2199: "Get your first show published", shown on the secretary's home page until her
 * club has published a show (the dashboard asks club_first_show_state, so it stays gone after a later
 * unpublish). The lines are the server's club list (club_publish_blockers),
 * read through the same hook and list the wizard uses, so offline and failed checks read the same.
 */
export function FirstShowCard({ clubId, draftShowId }: FirstShowCardProps) {
  const blockers = useClubPublishBlockers(clubId);
  const canOpenPayments = useCanOpenClubPayments(clubId);
  // MYK9-2214: a secretary with several clubs must see which club this is about. Until the name
  // loads (or if it cannot), the card keeps its plain wording.
  const clubName = useClubQuery(clubId).data?.name?.trim();
  const title = clubName
    ? `Get ${clubName}'s first show published`
    : 'Get your first show published';

  const fixFor = (blocker: PublishBlocker): PublishBlockerFix | undefined =>
    blocker.key === 'payouts_not_enabled' && canOpenPayments
      ? { href: clubPaymentsHref(clubId) }
      : undefined;

  return (
    <section
      aria-label={title}
      data-testid="first-show-card"
      className="mx-5 mb-3 rounded-lg border bg-card p-4"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Publishing makes your show visible, and exhibitors can enter once entries open. Here is what
        is left{clubName ? ` for ${clubName}` : ' for your club'}.
      </p>
      <div className="mt-3">
        <PublishBlockersList state={blockers} fixFor={fixFor} viewerIsClubAdmin={canOpenPayments} />
        {blockers.state === 'ready' && blockers.blockers.length === 0 ? (
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
