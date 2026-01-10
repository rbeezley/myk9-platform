/**
 * Exhibitor Layout Component
 *
 * Provides sidebar navigation layout specifically for exhibitor pages.
 * Uses SidebarLayout for consistent sidebar behavior across the app.
 */

import { Outlet } from 'react-router-dom';
import { ExhibitorSidebar } from './ExhibitorSidebar';
import { SidebarLayout, useSidebarLayoutState } from '@/components/layout/SidebarLayout';

interface ExhibitorLayoutProps {
  children?: React.ReactNode;
}

export function ExhibitorLayout({ children }: ExhibitorLayoutProps): React.ReactElement {
  const { mobileOpen, setMobileOpen, closeMobile } = useSidebarLayoutState();

  return (
    <SidebarLayout
      sidebar={<ExhibitorSidebar onCloseMobile={closeMobile} />}
      sidebarWidth={288}
      mobileMenuLabel="Exhibitor Dashboard"
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
    >
      <div className="px-6 py-8 max-w-7xl mx-auto">
        {children ?? <Outlet />}
      </div>
    </SidebarLayout>
  );
}

export default ExhibitorLayout;
