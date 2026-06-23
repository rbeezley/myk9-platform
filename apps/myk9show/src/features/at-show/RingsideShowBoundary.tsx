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

/** Full-screen wrapper — `/at-show` renders outside the sidebar layout. */
function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}

export function RingsideShowBoundary({ children }: { children: ReactNode }) {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();

  const showQuery = useQuery({
    queryKey: ['shows', 'at-show', 'ringside-boundary', showId],
    queryFn: () => replicatedShowsTable.getShowById(showId as string),
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

  if (!showQuery.data) {
    return (
      <FullScreen>
        <EmptyState
          icon={SearchX}
          title="Show not found"
          description="We couldn't find this show. It may have been removed, or the link may be out of date. Head back to your dashboard to find it."
          action={{ label: 'Back to dashboard', onClick: () => navigate('/'), icon: ArrowLeft }}
        />
      </FullScreen>
    );
  }

  return <>{children}</>;
}
