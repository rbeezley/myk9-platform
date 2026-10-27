/**
 * Club Admin Routes - Lazy loaded routes for club management
 *
 * All /club-admin/* pages render inside UnifiedAppLayout (sidebar provided by parent).
 * Protected by ClubAdminRoute (CLUB_ADMIN or SITE_ADMIN).
 * Members and Payments are tabs on the club page (MYK9-1293); these routes redirect there.
 */

import { Route } from 'react-router-dom';
import { lazyWithRetry } from '@/utils/lazyWithRetry';
import { ClubAdminRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { SuspenseWrapper } from './utils/SuspenseWrapper';

const ClubAdminRedirect = lazyWithRetry(() => import('@/pages/club-admin/ClubAdminRedirect'));

export function ClubAdminRoutes() {
  return (
    <>
      <Route
        path="/club-admin/members"
        element={
          <ClubAdminRoute>
            <SuspenseWrapper>
              <PageTransition>
                <ClubAdminRedirect />
              </PageTransition>
            </SuspenseWrapper>
          </ClubAdminRoute>
        }
      />
      <Route
        path="/club-admin/payments"
        element={
          <ClubAdminRoute>
            <SuspenseWrapper>
              <PageTransition>
                <ClubAdminRedirect />
              </PageTransition>
            </SuspenseWrapper>
          </ClubAdminRoute>
        }
      />
    </>
  );
}
