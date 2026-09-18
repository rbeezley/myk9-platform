import { Link } from 'react-router-dom';
import { TRIAL_SECRETARY_ONLY_REASON } from '@/features/actions/trialSecretaryAccess';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';

interface EntryManagementUnresolvedShowProps {
  /** Show resolution has finished. False means it is still in flight. */
  didResolveShow: boolean;
  /** A read failed. Null means nothing was ever selected, which is not an error. */
  showError: string | null;
  onRetry: () => void;
  retryDisabled?: boolean;
  /**
   * The reason this viewer's secretary-only controls are greyed, if any. The
   * "go to your shows" recovery points at `/shows` instead of
   * `/secretary/dashboard` — ProtectedRoute(SECRETARY | SITE_ADMIN), which
   * would refuse them (REV-2341 R-1) — but ONLY for the actual refusal.
   *
   * Compared against `TRIAL_SECRETARY_ONLY_REASON` rather than `!== undefined`:
   * the transient "Checking your access to this show…" is also a non-undefined
   * string, and treating it as a refusal sent a real trial secretary to the
   * public browse page during the resolving window (REV-2341 U-3).
   */
  secretaryOnlyReason?: string | undefined;
}

/**
 * What Entry Management shows when it has no show to manage.
 *
 * This lives ABOVE the page tabs, not inside one, because none of the tabs mean
 * anything without a show. Scoping it to the Registrations tab left the
 * Exceptions tab rendering only its three filter buttons over empty space --
 * the same silent blank surface the Registrations tab was fixed to stop
 * showing, one tab across.
 *
 * Three distinct states, deliberately not collapsed into two:
 *
 * - Resolution still running. `isLoadingShows` is NOT this: it goes false when
 *   the show LIST settles, while a deep-linked id is still being fetched.
 *   Concluding anything during that window states an unknown as a fact.
 * - A read failed. Retry is the recovery, and it must re-run the deep-link
 *   lookup rather than just the list.
 * - Nothing was ever selected. Not an error, so it must not be dressed as one;
 *   the recovery is to pick a show.
 */
export function EntryManagementUnresolvedShow({
  didResolveShow,
  showError,
  onRetry,
  retryDisabled = false,
  secretaryOnlyReason,
}: EntryManagementUnresolvedShowProps) {
  if (!didResolveShow) {
    return (
      <div role="status" aria-label="Opening show" className="py-4">
        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="py-12 text-center">
        <AlertCircle
          className={`mx-auto mb-4 h-12 w-12 ${showError ? 'text-destructive' : 'text-muted-foreground'}`}
          aria-hidden
        />
        <h2 className="mb-2 text-lg font-medium">
          {showError ? "Couldn't open this show" : 'No show selected'}
        </h2>
        <p className="mx-auto mb-4 max-w-md text-sm text-muted-foreground">
          {showError
            ? "We couldn't tell whether this show has entries, so nothing is shown below."
            : 'Choose a show to manage its entries.'}
        </p>
        {showError ? (
          <Button onClick={onRetry} disabled={retryDisabled}>
            Retry
          </Button>
        ) : secretaryOnlyReason === TRIAL_SECRETARY_ONLY_REASON ? (
          // `/secretary/dashboard` is ProtectedRoute(SECRETARY | SITE_ADMIN),
          // so for a club admin this was one more enabled link into a refusal
          // (REV-2341 R-1). Their shows are on `/shows`, which is theirs.
          <Button asChild variant="outline">
            <Link to="/shows">Go to your shows</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/secretary/dashboard">Go to your shows</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
