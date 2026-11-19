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
 *  - `/at-show/:showId/scores-not-sent`           → this device's unsent scores (MYK9-2011)
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

import { useEffect, type ReactNode } from 'react';
import { Route, useParams } from 'react-router-dom';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import { PageTransition } from '@/components/common/PageTransition';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { RoleSurfaceErrorBoundary } from '@/components/common/RoleSurfaceErrorBoundary';
import { createEnhancedLazy, RouteLazyPresets } from '@/utils/enhancedLazyLoading';
import { RingsideShowBoundary } from '@/features/at-show/RingsideShowBoundary';
import { AtShowAccessGate } from '@/features/at-show/AtShowAccessGate';
import { RingsideSessionHeartbeat } from '@/features/at-show/RingsideSessionHeartbeat';
import { StaleClassPromptHost } from '@/features/at-show/staleClass/StaleClassPromptHost';

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

const AtShowScoresNotSentPage = createEnhancedLazy(
  () => import('@/features/at-show/scoresNotSent/AtShowScoresNotSentPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowScoresNotSentPage' }
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
 * MYK9-2224: a confirmed save returns the judge to the class entry list (MYK9-2012). A judge who
 * opened the scoresheet directly has never loaded that route's chunk, and a first request made
 * after the network drops fails into the route error boundary, so the score saved on the device
 * looked lost. Request both list chunks while the sheet is open and the network is still there.
 */
function ScoresheetReturnPreload({ children }: { children: ReactNode }) {
  useEffect(() => {
    for (const page of [AtShowEntryListPage, AtShowCombinedEntryListPage]) {
      // Offline already or a flaky venue network: the sheet still works, so a miss is silent.
      page.preload().catch(() => undefined);
    }
  }, []);
  return <>{children}</>;
}

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
                <StaleClassPromptHost />
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
      {/* Every score on this device not on the server yet (MYK9-2011): works offline. */}
      <Route
        path="/at-show/:showId/scores-not-sent"
        element={atShowElement(<AtShowScoresNotSentPage />)}
      />
      {/* Live scoresheet (judge's mobile timer) — entry cards navigate here. */}
      <Route
        path="/at-show/:showId/class/:classId/score/:entryId"
        element={atShowElement(
          <ScoresheetReturnPreload>
            <AtShowScoresheetPage />
          </ScoresheetReturnPreload>
        )}
      />
    </>
  );
};
