/**
 * Factory for creating role-specific layout components.
 *
 * Each role layout wraps SidebarLayout with a RoleSidebar configured
 * from a SidebarConfig, eliminating per-role boilerplate.
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { useSidebarLayoutState } from '@/hooks/useSidebarLayoutState';
import { RoleSidebar } from './RoleSidebar';
import type { SidebarConfig } from './types';

export interface RoleLayoutOptions {
  /** Sidebar configuration (navigation, icons, labels) */
  config: SidebarConfig;
  /** Mobile hamburger menu label */
  mobileMenuLabel: string;
  /** Expanded sidebar width (default 240) */
  sidebarWidth?: number;
  /** Whether sidebar collapses to icon rail (default true) */
  collapsible?: boolean;
  /** Collapsed sidebar width (default 56) */
  collapsedWidth?: number;
  /** Wrap children in a max-width container (default false) */
  contentWrapper?: boolean;
}

export function createRoleLayout(options: RoleLayoutOptions) {
  const {
    config,
    mobileMenuLabel,
    sidebarWidth = 240,
    collapsible = true,
    collapsedWidth = 56,
    contentWrapper = false,
  } = options;

  const collapsibleProps = collapsible
    ? {
        collapsedWidth,
        isCollapsible: true as const,
        isCollapsed: true as const,
        hoverToExpand: true as const,
      }
    : {};

  const RoleLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const { mobileOpen, setMobileOpen } = useSidebarLayoutState();

    return (
      <SidebarLayout
        sidebar={<RoleSidebar config={config} />}
        sidebarWidth={sidebarWidth}
        {...collapsibleProps}
        mobileMenuLabel={mobileMenuLabel}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      >
        {contentWrapper ? (
          <div className="px-6 py-8 max-w-7xl mx-auto">{children ?? <Outlet />}</div>
        ) : (
          (children ?? <Outlet />)
        )}
      </SidebarLayout>
    );
  };

  RoleLayout.displayName = `${mobileMenuLabel.replace(/\s+/g, '')}Layout`;

  return RoleLayout;
}
