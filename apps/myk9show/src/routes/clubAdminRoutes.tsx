/**
 * Club Admin Routes - Lazy loaded routes for club management
 *
 * All /club-admin/* pages render inside UnifiedAppLayout (sidebar provided by parent).
 * Protected by ClubAdminRoute (CLUB_ADMIN or SITE_ADMIN).
 */

import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { ClubAdminRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { SuspenseWrapper } from './utils/SuspenseWrapper';

const ClubMembersPage = lazy(() => import('@/pages/club-admin/ClubMembersPage'));
const ClubPaymentsPage = lazy(() => import('@/pages/club-admin/ClubPaymentsPage'));

export function ClubAdminRoutes() {
  return (
    <>
      <Route
        path="/club-admin/members"
        element={
          <ClubAdminRoute>
            <SuspenseWrapper>
              <PageTransition>
                <ClubMembersPage />
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
                <ClubPaymentsPage />
              </PageTransition>
            </SuspenseWrapper>
          </ClubAdminRoute>
        }
      />
    </>
  );
}
