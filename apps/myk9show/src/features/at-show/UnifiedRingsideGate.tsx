/**
 * UnifiedRingsideGate — per-show enablement gate for the `/at-show` surface.
 *
 * Phase 1d. Replaces the old global, synchronous `isUnifiedRingsideEnabled()`
 * route-registration guard with a per-show, asynchronous check:
 *
 *  1. DEV escape hatch (`VITE_UNIFIED_RINGSIDE_ENABLED=true`) short-circuits to
 *     enabled without hitting the DB — local smoke-testing only.
 *  2. Otherwise read `shows.unified_ringside_enabled` for the `:showId` in the
 *     URL via the offline-first replication layer.
 *
 * While the flag loads we render a centered spinner; when a show is missing or
 * the flag is off we render an inline notice — never a 404.
 * INTENT: no dead ends — a disabled show explains itself and offers a way out.
 */

import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Radio } from 'lucide-react';
import { replicatedShowsTable } from '@/services/replication';
import { EmptyState, LoadingEmptyState } from '@/components/common/EmptyState';
import {
  isUnifiedRingsideDevOverride,
  resolveUnifiedRingsideEnabled,
} from './atShowFeatureFlag';

/** Full-screen wrapper — `/at-show` renders outside the sidebar layout. */
function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}

export function UnifiedRingsideGate({ children }: { children: ReactNode }) {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const devOverride = isUnifiedRingsideDevOverride();

  const showQuery = useQuery({
    queryKey: ['at-show', 'unified-ringside-enabled', showId],
    queryFn: () => replicatedShowsTable.getShowById(showId as string),
    // Dev override skips the fetch entirely; otherwise we need a showId.
    enabled: !!showId && !devOverride,
  });

  // Dev escape hatch wins immediately, no fetch required.
  if (devOverride) return <>{children}</>;

  if (showQuery.isLoading) {
    return (
      <FullScreen>
        <LoadingEmptyState message="Loading ringside…" />
      </FullScreen>
    );
  }

  const enabled = resolveUnifiedRingsideEnabled({
    devOverride,
    showEnabled: showQuery.data?.unifiedRingsideEnabled,
  });

  if (!enabled) {
    return (
      <FullScreen>
        <EmptyState
          icon={Radio}
          title="Ringside isn't enabled for this show"
          description="The unified at-show ringside experience hasn't been turned on for this show yet. Check back later, or head back to your dashboard."
          action={{ label: 'Back to dashboard', onClick: () => navigate('/'), icon: ArrowLeft }}
        />
      </FullScreen>
    );
  }

  return <>{children}</>;
}
