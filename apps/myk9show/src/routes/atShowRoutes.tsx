/**
 * At-Show Routes — unified ringside mount (flag-gated).
 *
 * Registers the at-show ringside routes that mount `@myk9/ringside` pages:
 *  - `/at-show/:showId/class/:classId`           → single-class EntryList (1a)
 *  - `/at-show/:showId/class/:classIdA/:classIdB` → combined Section A/B list (1h)
 * Rendered inside UnifiedAppLayout (sidebar provided by the parent route).
 *
 * Gated by `isUnifiedRingsideEnabled()` — OFF by default. When off, this
 * returns `null` so the routes are never registered and `/at-show/...` 404s.
 * The staff-role guard keeps the spike off exhibitors even when the flag is on.
 */

import { Route } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { UserRole } from '@/types/auth-types';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { createEnhancedLazy, RouteLazyPresets } from '@/utils/enhancedLazyLoading';
import { isUnifiedRingsideEnabled } from '@/features/at-show/atShowFeatureFlag';

const AtShowEntryListPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowEntryListPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowEntryListPage' }
);

const AtShowCombinedEntryListPage = createEnhancedLazy(
  () => import('@/features/at-show/AtShowCombinedEntryListPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AtShowCombinedEntryListPage' }
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

/** At-show ringside routes — rendered inside UnifiedAppLayout. */
export const AtShowRoutes = () => {
  if (!isUnifiedRingsideEnabled()) return null;
  return (
    <>
      <Route
        path="/at-show/:showId/class/:classId"
        element={
          <ProtectedRoute requiredRole={STAFF_ROLES}>
            <SuspenseWrapper>
              <PageTransition>
                <AtShowEntryListPage />
              </PageTransition>
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />
      {/* Combined Novice Section A/B — two class ids (A + B run together). */}
      <Route
        path="/at-show/:showId/class/:classIdA/:classIdB"
        element={
          <ProtectedRoute requiredRole={STAFF_ROLES}>
            <SuspenseWrapper>
              <PageTransition>
                <AtShowCombinedEntryListPage />
              </PageTransition>
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />
    </>
  );
};
