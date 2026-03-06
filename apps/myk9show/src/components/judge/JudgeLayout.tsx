/**
 * Judge Layout Component
 *
 * Provides collapsible sidebar navigation for judge pages.
 * Uses SidebarLayout with hover-to-expand: 56px icon rail -> 240px expanded.
 * Matches the SecretaryLayout pattern.
 */

import { Outlet } from 'react-router-dom';
import { JudgeSidebar } from './JudgeSidebar';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { useSidebarLayoutState } from '@/hooks/useSidebarLayoutState';

interface JudgeLayoutProps {
  children?: React.ReactNode;
}

export function JudgeLayout({ children }: JudgeLayoutProps): React.ReactElement {
  const { mobileOpen, setMobileOpen, closeMobile } = useSidebarLayoutState();

  return (
    <SidebarLayout
      sidebar={<JudgeSidebar onCloseMobile={closeMobile} />}
      sidebarWidth={240}
      collapsedWidth={56}
      isCollapsible={true}
      isCollapsed={true}
      hoverToExpand={true}
      mobileMenuLabel="Judge Console"
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
    >
      {children ?? <Outlet />}
    </SidebarLayout>
  );
}

export default JudgeLayout;
