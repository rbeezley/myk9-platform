/**
 * Admin Layout Component
 *
 * Provides sidebar navigation layout specifically for admin pages.
 * Uses SidebarLayout for consistent sidebar behavior across the app.
 */

import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import { SidebarLayout, useSidebarLayoutState } from '@/components/layout/SidebarLayout';

interface AdminLayoutProps {
  children?: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps): React.ReactElement {
  const { mobileOpen, setMobileOpen, closeMobile } = useSidebarLayoutState();

  return (
    <SidebarLayout
      sidebar={<AdminSidebar onCloseMobile={closeMobile} />}
      sidebarWidth={288}
      mobileMenuLabel="System Administration"
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
    >
      <div className="px-6 py-8 max-w-7xl mx-auto">
        {children ?? <Outlet />}
      </div>
    </SidebarLayout>
  );
}

export default AdminLayout;
