/**
 * At-Show Routes — Phase 1a unified ringside mount (flag-gated).
 *
 * Registers the single `/at-show/:showId/class/:classId` route that mounts
 * `@myk9/ringside`'s EntryList page via `AtShowEntryListPage`. Rendered inside
 * UnifiedAppLayout (sidebar provided by the parent route in App.tsx).
 *
 * Gated by `isUnifiedRingsideEnabled()` — OFF by default. When off, this
 * returns `null` so the route is never registered and `/at-show/...` 404s.
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
  );
};
