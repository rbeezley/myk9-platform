/**
 * Secretary Layout Component
 *
 * Provides collapsible sidebar navigation for secretary pages.
 * Uses createRoleLayout factory with secretary config.
 */

import { createRoleLayout } from '@/components/layout/sidebar';
import { secretarySidebarConfig } from './SecretarySidebar';

export const SecretaryLayout = createRoleLayout({
  config: secretarySidebarConfig,
  mobileMenuLabel: 'Secretary Console',
});

export default SecretaryLayout;
