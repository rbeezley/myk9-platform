/**
 * Admin Layout Component
 *
 * Provides sidebar navigation layout for admin pages.
 * Uses createRoleLayout factory with admin config.
 */

import { createRoleLayout } from '@/components/layout/sidebar';
import { adminSidebarConfig } from './AdminSidebar';

export const AdminLayout = createRoleLayout({
  config: adminSidebarConfig,
  mobileMenuLabel: 'System Administration',
  sidebarWidth: 288,
  collapsible: false,
  contentWrapper: true,
});

export default AdminLayout;
