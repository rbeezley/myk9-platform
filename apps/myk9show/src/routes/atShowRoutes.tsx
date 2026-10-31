/**
 * At-Show Routes — unified ringside mount.
 *
 * Registers the at-show ringside routes that mount `@myk9/ringside` pages:
 *  - `/at-show/:showId`                           → class picker (1a)
 *  - `/at-show/:showId/class/:classId`            → single-class EntryList (1a)
 *  - `/at-show/:showId/class/:classIdA/:classIdB` → combined Section A/B list (1h)
 *  - `/at-show/:showId/class/:classId/score/:entryId` → live scoresheet
 *  - `/at-show/:showId/dogs` + `/dogs/:dogKey`       → staff dog finder + dog page (MYK9-1509)
 *  - `/at-show/:showId/leaderboard`                → nationals leaderboard (MYK9-1540)
 *  - `/at-show/:showId/setup-sheet`               → printable judge setup cheat sheet
 * Mounted OUTSIDE UnifiedAppLayout (full-screen ringside — no host sidebar or
 * header; see App.tsx), which is why the boundary's states use a full-screen
 * wrapper.
 *
 * The surface is available for every show — the old per-show
 * `unified_ringside_enabled` feature flag was removed pre-launch (see
 * `docs/plan-remove-unified-ringside-flag.md`). `RingsideShowBoundary` keeps the
 * resilience the gate provided (loading / retry / missing-show notice — never a
 * 404). `AtShowAccessGate` admits either account staff or a matching show-scoped
 * passcode grant, so QR/passcode ringside access works without account RBAC.
 */

import type { ReactNode } from 'react';
import { Route, useParams } from 'react-router-dom';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import { PageTransition } from '@/components/common/PageTransition';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { RoleSurfaceErrorBoundary } from '@/components/common/RoleSurfaceErrorBoundary';
import { createEnhancedLazy, RouteLazyPresets } from '@/utils/enhancedLazyLoading';
import { RingsideShowBoundary } from '@/features/at-show/RingsideShowBoundary';
import { AtShowAccessGate } from '@/features/at-show/AtShowAccessGate';
import { RingsideSessionHeartbeat } from '@/features/at-show/RingsideSessionHeartbeat';

const AtShowEntryListPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowEntryListPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowEntryListPage' }
);

const AtShowCombinedEntryListPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowCombinedEntryListPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowCombinedEntryListPage' }
);

const AtShowScoresheetPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowScoresheetPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowScoresheetPage' }
);

const AtShowSetupSheetPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowSetupSheetPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowSetupSheetPage' }
);

const AtShowDogsPage = createEnhancedLazy(() => import('@/features/at-show/AtShowDogsPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'AtShowDogsPage',
});

const AtShowDogPage = createEnhancedLazy(() => import('@/features/at-show/AtShowDogPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'AtShowDogPage',
});

const AtShowClassListPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowClassListPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowClassListPage' }
);

const AtShowLeaderboardPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowLeaderboardPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowLeaderboardPage' }
);

/**
 * Broadcast show presence while an at-show page is open. Reads `:showId` from the
 * route (so it must render inside the routed tree) and makes the admitted user a
 * presence producer — this is where exhibitors and judges spend show day.
 */
function AtShowPresenceBoundary({ children }: { children: ReactNode }) {
  const { showId } = useParams<{ showId: string }>();
  return <ShowPresenceProvider showId={showId}>{children}</ShowPresenceProvider>;
}

/**
 * Wrap an at-show page in the shared guard stack: access gate → suspense →
 * show-resilience boundary → presence boundary → page transition.
 */
function atShowElement(page: ReactNode): ReactNode {
  return (
    <AtShowAccessGate>
      <RoleSurfaceErrorBoundary surface="ringside">
        <RingsideSessionHeartbeat>
          <SuspenseWrapper>
            <RingsideShowBoundary>
              <AtShowPresenceBoundary>
                <PageTransition>{page}</PageTransition>
              </AtShowPresenceBoundary>
            </RingsideShowBoundary>
          </SuspenseWrapper>
        </RingsideSessionHeartbeat>
      </RoleSurfaceErrorBoundary>
    </AtShowAccessGate>
  );
}

/** At-show ringside routes — mounted full-screen, outside UnifiedAppLayout. */
export const AtShowRoutes = () => {
  return (
    <>
      {/* Class picker — the navigation entry into the at-show flow. */}
      <Route path="/at-show/:showId" element={atShowElement(<AtShowClassListPage />)} />
      <Route
        path="/at-show/:showId/class/:classId"
        element={atShowElement(<AtShowEntryListPage />)}
      />
      {/* Combined Novice Section A/B — two class ids (A + B run together). */}
      <Route
        path="/at-show/:showId/class/:classIdA/:classIdB"
        element={atShowElement(<AtShowCombinedEntryListPage />)}
      />
      {/* Staff dog finder + dog page (MYK9-1509). */}
      <Route path="/at-show/:showId/dogs" element={atShowElement(<AtShowDogsPage />)} />
      <Route path="/at-show/:showId/dogs/:dogKey" element={atShowElement(<AtShowDogPage />)} />
      {/* Nationals leaderboard (MYK9-1540): staff only, nationals shows only. */}
      <Route
        path="/at-show/:showId/leaderboard"
        element={atShowElement(<AtShowLeaderboardPage />)}
      />
      {/* Printable judge setup cheat sheet (MYK9-1078): static, so it works offline. */}
      <Route
        path="/at-show/:showId/setup-sheet"
        element={atShowElement(<AtShowSetupSheetPage />)}
      />
      {/* Live scoresheet (judge's mobile timer) — entry cards navigate here. */}
      <Route
        path="/at-show/:showId/class/:classId/score/:entryId"
        element={atShowElement(<AtShowScoresheetPage />)}
      />
    </>
  );
};
