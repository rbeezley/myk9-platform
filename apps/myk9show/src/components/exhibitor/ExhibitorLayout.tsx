/**
 * Exhibitor Layout Component
 *
 * Provides collapsible sidebar navigation for exhibitor pages.
 * Uses createRoleLayout factory with exhibitor config.
 */

import { createRoleLayout } from '@/components/layout/sidebar';
import { exhibitorSidebarConfig } from './ExhibitorSidebar';

export const ExhibitorLayout = createRoleLayout({
  config: exhibitorSidebarConfig,
  mobileMenuLabel: 'Exhibitor Dashboard',
  contentWrapper: true,
});

export default ExhibitorLayout;
