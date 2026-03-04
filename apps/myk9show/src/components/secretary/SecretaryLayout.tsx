/**
 * Secretary Layout Component
 *
 * Provides collapsible sidebar navigation for secretary pages.
 * Uses SidebarLayout with hover-to-expand: 56px icon rail → 240px expanded.
 */

import { Outlet } from 'react-router-dom';
import { SecretarySidebar } from './SecretarySidebar';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { useSidebarLayoutState } from '@/hooks/useSidebarLayoutState';

interface SecretaryLayoutProps {
  children?: React.ReactNode;
}

export function SecretaryLayout({ children }: SecretaryLayoutProps): React.ReactElement {
  const { mobileOpen, setMobileOpen, closeMobile } = useSidebarLayoutState();

  return (
    <SidebarLayout
      sidebar={<SecretarySidebar onCloseMobile={closeMobile} />}
      sidebarWidth={240}
      collapsedWidth={56}
      isCollapsible={true}
      isCollapsed={true}
      hoverToExpand={true}
      mobileMenuLabel="Secretary Console"
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
    >
      {children ?? <Outlet />}
    </SidebarLayout>
  );
}

export default SecretaryLayout;
