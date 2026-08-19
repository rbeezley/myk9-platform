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
import { ArrowLeft, SearchX } from 'lucide-react';
import { replicatedShowsTable } from '@/services/replication';
import { EmptyState, ErrorEmptyState, LoadingEmptyState } from '@/components/common/EmptyState';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useOnlineStatus } from '@/lib/networkUtils';
import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { hasRingsideStaffRole } from './ringsideAccountAccess';

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
  const syncResult = await replicatedShowsTable.sync('');
  if (!syncResult.success) {
    throw syncResult.error ?? new Error("We couldn't refresh shows");
  }

  return {
    show: await replicatedShowsTable.getShowById(showId),
    verifiedOnline: true,
  };
}

function MissingShowState({
  showId,
  verifiedOnline,
}: {
  showId: string | undefined;
  verifiedOnline: boolean;
}) {
  const { user, hasRole } = useAuthContext();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const canPrime = Boolean(user && !user.is_anonymous && hasRingsideStaffRole(hasRole));
  const showIsUncached = !verifiedOnline && !isOnline;

  return (
    <div className="flex flex-col items-center">
      <EmptyState
        icon={SearchX}
        title={showIsUncached ? "This show isn't saved on this device" : 'Show not found'}
        description={
          showIsUncached
            ? 'This device has no saved copy of this show. Connect to the internet and prepare it for offline use before continuing.'
            : "We couldn't find this show. It may have been removed, or the link may be out of date. Head back to your dashboard to find it."
        }
        action={{ label: 'Back to dashboard', onClick: () => navigate('/'), icon: ArrowLeft }}
      />
      {showIsUncached && canPrime && showId && (
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
          verifiedOnline={showQuery.data?.verifiedOnline ?? false}
        />
      </FullScreen>
    );
  }

  return <>{children}</>;
}
