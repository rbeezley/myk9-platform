/**
 * UnifiedAppLayout — root layout with adaptive sidebar navigation.
 *
 * Replaces the per-role layout wrappers (JudgeLayout, ExhibitorLayout,
 * SecretaryLayout, AdminLayout) with a single layout that adapts its
 * sidebar sections based on the user's roles.
 *
 * Scoring routes render OUTSIDE this layout (full-screen, no sidebar).
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { RoleSidebar } from '@/components/layout/sidebar';
import { useSidebarLayoutState } from '@/hooks/useSidebarLayoutState';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClubStore } from '@/store/clubStore';
import { useShowStore } from '@/store/showStore';
import { useRegisterAppShellMobileNav } from './useAppShellMobileNav';
import { buildUnifiedSidebarConfig } from './sidebar/unifiedSidebarConfig';
import type { ClubContext, NextShowContext } from './sidebar/unifiedSidebarConfig';
import { useMyShows } from '@/hooks/useMyShows';
import { useCurrentValidatedClubContext } from '@/hooks/useValidatedClubContext';

export const UnifiedAppLayout: React.FC = () => {
  const { user, getUserRoles, firstName } = useAuthContext();
  const roles = getUserRoles();
  const ensureClubsReady = useClubStore(s => s.ensureClubsReady);
  const shows = useShowStore(s => s.shows);
  const validatedClubContext = useCurrentValidatedClubContext();

  useEffect(() => {
    void ensureClubsReady();
  }, [ensureClubsReady]);

  const clubContext = useMemo<ClubContext | undefined>(() => {
    if (validatedClubContext.status !== 'ready') return undefined;
    return {
      clubId: validatedClubContext.clubId,
      clubName: validatedClubContext.clubName,
    };
  }, [validatedClubContext]);
  const { today, upcoming, draft } = useMyShows(shows);

  const nextShow = useMemo((): NextShowContext | undefined => {
    const todayShow = today[0];
    if (todayShow) return { id: todayShow.id, name: todayShow.name, phase: 'today' };
    const upcomingShow = upcoming[0];
    if (upcomingShow) return { id: upcomingShow.id, name: upcomingShow.name, phase: 'upcoming' };
    const draftShow = draft[0];
    if (draftShow) return { id: draftShow.id, name: draftShow.name, phase: 'draft' };
    return undefined;
  }, [today, upcoming, draft]);

  const sidebarConfig = useMemo(
    () => buildUnifiedSidebarConfig(roles, clubContext, nextShow, firstName),
    [roles, clubContext, nextShow, firstName]
  );
  const { mobileOpen, setMobileOpen } = useSidebarLayoutState();
  const openMobileNav = useCallback(() => setMobileOpen(true), [setMobileOpen]);
  useRegisterAppShellMobileNav(openMobileNav, mobileOpen);

  // Guest users see content without sidebar
  if (!user) {
    return <Outlet />;
  }

  return (
    <SidebarLayout
      sidebar={<RoleSidebar config={sidebarConfig} />}
      sidebarWidth={240}
      mobileMenuLabel="Navigation"
      showMobileMenuButton={false}
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
    >
      <Outlet />
    </SidebarLayout>
  );
};

export default UnifiedAppLayout;
