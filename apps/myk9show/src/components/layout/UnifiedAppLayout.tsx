/**
 * UnifiedAppLayout — root layout with adaptive sidebar navigation.
 *
 * Replaces the per-role layout wrappers (JudgeLayout, ExhibitorLayout,
 * SecretaryLayout, AdminLayout) with a single layout that adapts its
 * sidebar sections based on the user's roles.
 *
 * Scoring routes render OUTSIDE this layout (full-screen, no sidebar).
 */

import React, { useCallback, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { RoleSidebar } from '@/components/layout/sidebar';
import { useSidebarLayoutState } from '@/hooks/useSidebarLayoutState';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole, ScopeType } from '@/types/auth-types';
import type { RoleScope } from '@/types/auth-types';
import { useClubStore } from '@/store/clubStore';
import { useShowStore } from '@/store/showStore';
import { AskQPanel } from '@/components/askq/AskQPanel';
import { useRegisterAppShellMobileNav } from './useAppShellMobileNav';
import { buildUnifiedSidebarConfig } from './sidebar/unifiedSidebarConfig';
import type { ClubContext, NextShowContext } from './sidebar/unifiedSidebarConfig';
import { useMyShows } from '@/hooks/useMyShows';

function useClubContext(
  roles: UserRole[],
  scopes: RoleScope[],
  clubs: { id: string; name: string }[]
): ClubContext | undefined {
  return useMemo(() => {
    const isClubAdmin = roles.includes(UserRole.CLUB_ADMIN) || roles.includes(UserRole.SITE_ADMIN);
    if (!isClubAdmin || scopes.length === 0) return undefined;

    const clubScope = scopes.find(
      s => s.scopeType === ScopeType.CLUB && s.roleId === UserRole.CLUB_ADMIN
    );
    if (!clubScope?.scopeId) return undefined;

    const club = clubs.find(c => c.id === clubScope.scopeId);
    return { clubId: clubScope.scopeId, clubName: club?.name ?? 'My Club' };
  }, [roles, scopes, clubs]);
}

const EMPTY_SCOPES: RoleScope[] = [];

export const UnifiedAppLayout: React.FC = () => {
  const { user, getUserRoles, userWithRoles } = useAuthContext();
  const roles = getUserRoles();
  const clubs = useClubStore(s => s.clubs);
  const shows = useShowStore(s => s.shows);
  const scopes = userWithRoles?.scopes ?? EMPTY_SCOPES;
  const clubContext = useClubContext(roles, scopes, clubs);
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
    () => buildUnifiedSidebarConfig(roles, clubContext, nextShow),
    [roles, clubContext, nextShow]
  );
  const { mobileOpen, setMobileOpen } = useSidebarLayoutState();
  const openMobileNav = useCallback(() => setMobileOpen(true), [setMobileOpen]);
  useRegisterAppShellMobileNav(openMobileNav, mobileOpen);

  // Guest users see content without sidebar
  if (!user) {
    return (
      <>
        <Outlet />
        {/* AskQ AI Assistant Panel */}
        <AskQPanel />
      </>
    );
  }

  return (
    <>
      <SidebarLayout
        sidebar={<RoleSidebar config={sidebarConfig} />}
        sidebarWidth={240}
        collapsedWidth={56}
        isCollapsible
        isCollapsed
        hoverToExpand
        mobileMenuLabel="Navigation"
        showMobileMenuButton={false}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      >
        <Outlet />
      </SidebarLayout>
      {/* AskQ AI Assistant Panel */}
      <AskQPanel />
    </>
  );
};

export default UnifiedAppLayout;
