/**
 * RingsideShowBoundary — resilience boundary for the `/at-show` surface.
 *
 * Formerly `UnifiedRingsideGate`, the per-show `unified_ringside_enabled`
 * feature gate. That flag was removed pre-launch (the surface is now always
 * available, gated only by `AtShowAccessGate` for role/passcode access) — see
 * `docs/plan-remove-unified-ringside-flag.md`. What remains is the
 * resilience the gate also provided: while the show loads we render a spinner,
 * on a fetch failure we offer a retry, and for a missing show we render an
 * inline notice with a way back.
 *
 * INTENT: no dead ends — an unloadable or missing show explains itself and
 * offers a way out; never a 404.
 */

import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, SearchX } from 'lucide-react';
import { replicatedShowsTable } from '@/services/replication';
import { EmptyState, ErrorEmptyState, LoadingEmptyState } from '@/components/common/EmptyState';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useOnlineStatus } from '@/lib/networkUtils';
import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { hasRingsideStaffRole } from './ringsideAccountAccess';
import {
  ShowUnreachableError,
  isShowUnreachableError,
  missingShowCopy,
  resolveMissingShowReason,
  shouldOfferPriming,
  type MissingShowReason,
} from './missingShowState';

/** Full-screen wrapper — `/at-show` renders outside the sidebar layout. */
function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}

async function loadShow(showId: string, isOnline: boolean, canVerifyOnline: boolean) {
  const show = await replicatedShowsTable.getShowById(showId);
  if (show || !isOnline || !canVerifyOnline) return { show, verifiedOnline: false };

  // A local miss while online is not enough to call the show unknown: the
  // replica may simply be cold. Sync the show table, then make the same local
  // read again so a real 404 remains distinguishable from an uncached show.
  await replicatedShowsTable.updateSyncMetadata({
    lastIncrementalSyncAt: 0,
    // The table may be partially populated, so resetting only the global
    // watermark could still skip the missing show in a scoped sync.
    scopes: {},
  });
  // A failed refresh after a confirmed local miss is NOT a generic error: we
  // already know this device holds no copy, so the recoverable "not saved on
  // this device" state applies. Typing the throw is what lets the boundary
  // tell that apart from an IndexedDB read that blew up.
  const syncResult = await replicatedShowsTable.sync('');
  if (!syncResult.success) {
    throw new ShowUnreachableError(syncResult.error);
  }

  return {
    show: await replicatedShowsTable.getShowById(showId),
    verifiedOnline: true,
  };
}

function MissingShowState({
  showId,
  reason,
  onRetry,
}: {
  showId: string | undefined;
  reason: MissingShowReason;
  onRetry?: () => void;
}) {
  const { user, hasRole } = useAuthContext();
  const navigate = useNavigate();
  const canPrime = Boolean(user && !user.is_anonymous && hasRingsideStaffRole(hasRole));
  const offerPriming = shouldOfferPriming({
    reason,
    isStaff: canPrime,
    hasShowId: Boolean(showId),
  });
  const copy = missingShowCopy(reason);
  const backToDashboard = {
    label: 'Back to dashboard',
    onClick: () => navigate('/'),
    icon: ArrowLeft,
  };

  return (
    <div className="flex flex-col items-center">
      <EmptyState
        icon={SearchX}
        title={copy.title}
        description={copy.description}
        // When the server is merely unreachable, retrying IS the likeliest fix
        // once signal returns, so it leads and the dashboard becomes the exit.
        action={
          onRetry ? { label: 'Try again', onClick: onRetry, icon: RefreshCw } : backToDashboard
        }
        secondaryAction={
          onRetry
            ? { label: 'Back to dashboard', onClick: () => navigate('/'), icon: ArrowLeft }
            : undefined
        }
      />
      {offerPriming && showId && (
        <div className="-mt-6 mb-16">
          <OfflineReadyBadge showId={showId} />
        </div>
      )}
    </div>
  );
}

export function RingsideShowBoundary({ children }: { children: ReactNode }) {
  const { showId } = useParams<{ showId: string }>();
  const { user } = useAuthContext();
  const isOnline = useOnlineStatus();
  const canVerifyOnline = Boolean(user && !user.is_anonymous);

  const showQuery = useQuery({
    queryKey: ['shows', 'at-show', 'ringside-boundary', showId, isOnline, canVerifyOnline],
    queryFn: () => loadShow(showId as string, isOnline, canVerifyOnline),
    enabled: !!showId,
    // This query reads IndexedDB first and must run without a network. The
    // default "online" mode pauses queryFn offline, which bypasses the durable
    // show row and incorrectly falls through to the uncached-show state.
    networkMode: 'always',
    // Online status is part of the key so a cold offline route can re-verify
    // when connectivity returns. Keep the last verified show during that key
    // transition: replacing children with the loading state unmounts an open
    // nested scoresheet and restarts its scoped hydration while offline.
    placeholderData: previousData => (previousData?.show?.id === showId ? previousData : undefined),
  });

  if (showQuery.isLoading) {
    return (
      <FullScreen>
        <LoadingEmptyState message="Loading ringside…" />
      </FullScreen>
    );
  }

  // Distinguish a transient fetch failure from a genuinely missing show — an
  // error gets a retry, a missing show gets the "not found" notice below.
  if (showQuery.isError) {
    // An unreachable backend after a confirmed local miss is a recoverable
    // state, not a crash. Routing it through the generic error card is what
    // stranded a judge on a cold device: the only button offered ("Try Again")
    // cannot succeed while the backend is down, and the priming affordance
    // that DOES fix the device never rendered at all (MYK9-205).
    if (isShowUnreachableError(showQuery.error)) {
      return (
        <FullScreen>
          <MissingShowState
            showId={showId}
            reason="unreachable"
            onRetry={() => void showQuery.refetch()}
          />
        </FullScreen>
      );
    }

    return (
      <FullScreen>
        <ErrorEmptyState
          error="We couldn't load this show. Check your connection and try again."
          onRetry={() => void showQuery.refetch()}
        />
      </FullScreen>
    );
  }

  if (!showQuery.data?.show) {
    return (
      <FullScreen>
        <MissingShowState
          showId={showId}
          reason={resolveMissingShowReason({
            verifiedOnline: showQuery.data?.verifiedOnline ?? false,
            isOnline,
          })}
        />
      </FullScreen>
    );
  }

  return <>{children}</>;
}
