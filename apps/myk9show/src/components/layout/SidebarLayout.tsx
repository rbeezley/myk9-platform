/**
 * SidebarLayout Component
 *
 * A reusable layout component that handles sidebar positioning, mobile responsiveness,
 * and proper z-index layering relative to the app header.
 *
 * This is the SINGLE SOURCE OF TRUTH for sidebar layout behavior.
 * All pages with sidebars should use this component for consistency.
 *
 * Design decisions:
 * - Sidebar is positioned below the fixed header (top-16 = 64px)
 * - Sidebar z-index (z-40) is below header z-index (z-50)
 * - Mobile overlay appears below header but above content
 * - Supports both fixed-width and dynamic-width (collapsible) sidebars
 */

import React, { ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

// Layout constants - single source of truth
export const SIDEBAR_LAYOUT_CONSTANTS = {
  /** App header height in pixels (h-16 = 4rem = 64px) */
  HEADER_HEIGHT: 64,
  /** Tailwind class for header height offset */
  HEADER_OFFSET_CLASS: 'top-16',
  /** Default sidebar width in pixels */
  DEFAULT_WIDTH: 288, // w-72 = 18rem = 288px
  /** Collapsed sidebar width in pixels */
  COLLAPSED_WIDTH: 80, // 5rem = 80px
  /** Z-index for sidebar (below header z-50) */
  SIDEBAR_Z_INDEX: 'z-40',
  /** Z-index for mobile overlay */
  OVERLAY_Z_INDEX: 'z-40',
} as const;

export interface SidebarLayoutProps {
  /** The sidebar content to render */
  sidebar: ReactNode;
  /** The main content area */
  children: ReactNode;
  /** Optional custom class name for the container */
  className?: string;
  /** Sidebar width in pixels (default: 288px / w-72) */
  sidebarWidth?: number;
  /** Whether the sidebar is collapsible */
  isCollapsible?: boolean;
  /** Whether the sidebar is currently collapsed (controlled) */
  isCollapsed?: boolean;
  /** Callback when collapse state changes */
  onCollapseChange?: (collapsed: boolean) => void;
  /** Label for the mobile menu button */
  mobileMenuLabel?: string;
  /** Whether to show the mobile menu button (default: true) */
  showMobileMenuButton?: boolean;
  /** Custom content for mobile header area */
  mobileHeaderContent?: ReactNode;
  /** Controlled mobile sidebar open state */
  mobileOpen?: boolean;
  /** Callback when mobile sidebar open state changes */
  onMobileOpenChange?: (open: boolean) => void;
}

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({
  sidebar,
  children,
  className,
  sidebarWidth = SIDEBAR_LAYOUT_CONSTANTS.DEFAULT_WIDTH,
  isCollapsible = false,
  isCollapsed = false,
  onCollapseChange: _onCollapseChange,
  mobileMenuLabel = 'Menu',
  showMobileMenuButton = true,
  mobileHeaderContent,
  mobileOpen: controlledMobileOpen,
  onMobileOpenChange,
}) => {
  // Internal mobile state (uncontrolled mode)
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);

  // Use controlled or uncontrolled mobile state
  const mobileOpen = controlledMobileOpen !== undefined ? controlledMobileOpen : internalMobileOpen;
  const setMobileOpen = onMobileOpenChange || setInternalMobileOpen;

  // Calculate actual sidebar width based on collapse state
  const actualWidth = isCollapsible && isCollapsed
    ? SIDEBAR_LAYOUT_CONSTANTS.COLLAPSED_WIDTH
    : sidebarWidth;

  return (
    <div className={cn('flex min-h-screen bg-background', className)}>
      {/* Mobile sidebar overlay - positioned below header */}
      {mobileOpen && (
        <div
          className={cn(
            'fixed inset-0',
            SIDEBAR_LAYOUT_CONSTANTS.HEADER_OFFSET_CLASS,
            SIDEBAR_LAYOUT_CONSTANTS.OVERLAY_Z_INDEX,
            'bg-black/50 backdrop-blur-sm md:hidden'
          )}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container - positioned below header */}
      <div
        className={cn(
          'fixed bottom-0 left-0',
          SIDEBAR_LAYOUT_CONSTANTS.HEADER_OFFSET_CLASS,
          SIDEBAR_LAYOUT_CONSTANTS.SIDEBAR_Z_INDEX,
          'border-r border-border/30',
          'bg-[var(--sidebar)]',
          'transform transition-all duration-300 ease-in-out',
          // Desktop: always visible
          'md:translate-x-0',
          // Mobile: slide in/out
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ width: actualWidth }}
      >
        {/* Clone sidebar and inject onCloseMobile prop if it accepts it */}
        {React.isValidElement(sidebar)
          ? React.cloneElement(sidebar as React.ReactElement<{ onCloseMobile?: () => void }>, {
              onCloseMobile: () => setMobileOpen(false),
            })
          : sidebar}
      </div>

      {/* Main content area with responsive left margin */}
      <main
        className={cn(
          'flex-1 overflow-auto pt-16 transition-all duration-300 ease-in-out',
          'md:ml-[var(--sidebar-width)]'
        )}
        style={{ '--sidebar-width': `${actualWidth}px` } as React.CSSProperties}
      >
        {/* Mobile header with menu button */}
        {showMobileMenuButton && (
          <div className="md:hidden p-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-16 z-30">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-4 w-4 mr-2" />
                {mobileMenuLabel}
              </Button>
              {mobileHeaderContent}
            </div>
          </div>
        )}

        {children}
      </main>
    </div>
  );
};

export default SidebarLayout;
