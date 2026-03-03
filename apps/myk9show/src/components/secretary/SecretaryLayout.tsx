/**
 * Secretary Layout Component
 *
 * Provides sidebar navigation layout specifically for secretary pages.
 * Uses SidebarLayout for consistent sidebar behavior across the app.
 */

import { Outlet } from 'react-router-dom';
import { SecretarySidebar } from './SecretarySidebar';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { useSidebarLayoutState } from '@/hooks/useSidebarLayoutState';

interface SecretaryLayoutProps {
  children?: React.ReactNode;
  fullWidth?: boolean;
}

export function SecretaryLayout({ children, fullWidth }: SecretaryLayoutProps): React.ReactElement {
  const { mobileOpen, setMobileOpen, closeMobile } = useSidebarLayoutState();

  return (
    <SidebarLayout
      sidebar={<SecretarySidebar onCloseMobile={closeMobile} />}
      sidebarWidth={288}
      mobileMenuLabel="Secretary Dashboard"
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
    >
      <div className={fullWidth ? 'px-6 py-6' : 'px-6 py-8 max-w-7xl mx-auto'}>
        {children ?? <Outlet />}
      </div>
    </SidebarLayout>
  );
}

export default SecretaryLayout;
