import { useState } from 'react';

/**
 * Hook to manage sidebar layout state
 * Useful for pages that need to control sidebar collapse and mobile state
 */
export function useSidebarLayoutState(options?: {
  defaultCollapsed?: boolean;
  defaultMobileOpen?: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(options?.defaultCollapsed ?? false);
  const [mobileOpen, setMobileOpen] = useState(options?.defaultMobileOpen ?? false);

  return {
    isCollapsed,
    setIsCollapsed,
    toggleCollapsed: () => setIsCollapsed(prev => !prev),
    mobileOpen,
    setMobileOpen,
    toggleMobileOpen: () => setMobileOpen(prev => !prev),
    closeMobile: () => setMobileOpen(false),
  };
}
