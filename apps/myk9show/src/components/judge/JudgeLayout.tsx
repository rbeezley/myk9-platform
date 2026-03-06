/**
 * Judge Layout Component
 *
 * Provides collapsible sidebar navigation for judge pages.
 * Uses createRoleLayout factory with judge config.
 */

import { createRoleLayout } from '@/components/layout/sidebar';
import { judgeSidebarConfig } from './JudgeSidebar';

export const JudgeLayout = createRoleLayout({
  config: judgeSidebarConfig,
  mobileMenuLabel: 'Judge Console',
});

export default JudgeLayout;
