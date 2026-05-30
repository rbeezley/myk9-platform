/**
 * At-Show Routes — unified ringside mount.
 *
 * Registers the at-show ringside routes that mount `@myk9/ringside` pages:
 *  - `/at-show/:showId`                           → class picker (1a)
 *  - `/at-show/:showId/class/:classId`            → single-class EntryList (1a)
 *  - `/at-show/:showId/class/:classIdA/:classIdB` → combined Section A/B list (1h)
 *  - `/at-show/:showId/class/:classId/score/:entryId` → live scoresheet
 * Mounted OUTSIDE UnifiedAppLayout (full-screen ringside — no host sidebar or
 * header; see App.tsx), which is why the gate's states use a full-screen wrapper.
 *
 * Enablement is per-show and asynchronous (Phase 1d): routes are registered
 * unconditionally, and `UnifiedRingsideGate` reads `shows.unified_ringside_enabled`
 * for the `:showId` in the URL, rendering an inline notice when off — never a
 * 404. The staff-role guard keeps the surface off exhibitors regardless.
 */

import type { ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { UserRole } from '@/types/auth-types';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { createEnhancedLazy, RouteLazyPresets } from '@/utils/enhancedLazyLoading';
import { UnifiedRingsideGate } from '@/features/at-show/UnifiedRingsideGate';

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

const AtShowClassListPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowClassListPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowClassListPage' }
);

/** Show-running staff who can use the ringside at-show surface. */
const STAFF_ROLES = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.JUDGE,
  UserRole.STEWARD,
];

/**
 * Wrap an at-show page in the shared guard stack: role gate → suspense →
 * per-show enablement gate → page transition. Keeps the four routes DRY and
 * guarantees every at-show surface passes through `UnifiedRingsideGate`.
 */
function atShowElement(page: ReactNode): ReactNode {
  return (
    <ProtectedRoute requiredRole={STAFF_ROLES}>
      <SuspenseWrapper>
        <UnifiedRingsideGate>
          <PageTransition>{page}</PageTransition>
        </UnifiedRingsideGate>
      </SuspenseWrapper>
    </ProtectedRoute>
  );
}

/** At-show ringside routes — rendered inside UnifiedAppLayout. */
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
      {/* Live scoresheet (judge's mobile timer) — entry cards navigate here. */}
      <Route
        path="/at-show/:showId/class/:classId/score/:entryId"
        element={atShowElement(<AtShowScoresheetPage />)}
      />
    </>
  );
};
