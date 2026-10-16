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
 * - Sidebar is positioned below the fixed chrome via --app-top-inset
 *   (3rem header, or 3rem + PWA banner when the install banner is showing)
 * - Sidebar z-index (z-40) is below header z-index (z-50)
 * - Mobile overlay appears below header but above content
 * - The sidebar's width is set by the caller (desktop rail or mobile drawer)
 */

import React, { ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { APP_SHELL_HEADER_HEIGHT_PX } from './appShellContract';
import { useIsGuestLanding } from './useIsGuestLanding';

// Layout constants - single source of truth
const SIDEBAR_LAYOUT_CONSTANTS = {
  /** App header height in pixels (h-12 = 3rem = 48px) */
  HEADER_HEIGHT: APP_SHELL_HEADER_HEIGHT_PX,
  /** Tailwind class that offsets fixed children below the app top-chrome.
   *  Reads --app-top-inset (index.css): 3rem header alone, or 3rem + the PWA
   *  install banner when it is showing. Falls back to 3rem if the var is unset. */
  HEADER_OFFSET_CLASS: 'top-[var(--app-top-inset,3rem)]',
  /** Default sidebar width in pixels */
  DEFAULT_WIDTH: 288, // w-72 = 18rem = 288px
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
  mobileMenuLabel = 'Menu',
  showMobileMenuButton = true,
  mobileHeaderContent,
  mobileOpen: controlledMobileOpen,
  onMobileOpenChange,
}) => {
  // Internal mobile state (uncontrolled mode)
  const isGuestLanding = useIsGuestLanding();
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);

  // Use controlled or uncontrolled mobile state
  const mobileOpen = controlledMobileOpen !== undefined ? controlledMobileOpen : internalMobileOpen;
  const setMobileOpen = onMobileOpenChange || setInternalMobileOpen;

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
          'border-r border-[var(--sidebar-border)]',
          'bg-[var(--sidebar)]',
          'transform transition-all duration-300 ease-in-out',
          // Desktop: always visible
          'md:translate-x-0',
          // Mobile: slide in/out
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ width: sidebarWidth }}
      >
        {/* Clone sidebar and inject onCloseMobile prop if it accepts it */}
        {React.isValidElement(sidebar)
          ? React.cloneElement(sidebar as React.ReactElement<{ onCloseMobile?: () => void }>, {
              onCloseMobile: () => setMobileOpen(false),
            })
          : sidebar}
      </div>

      {/* Main content area with responsive left margin.
          pt-12 clears the fixed header only — the PWA banner offset is already
          applied by PWAInstallBanner's in-flow spacer above this subtree, so we
          must NOT add --app-top-inset here or the banner height double-counts.

          NO `overflow` here, deliberately (MYK9-510, docs/adr/011). Any
          non-visible overflow makes this element the nearest scroll container
          for every descendant, and it never actually scrolls — the document
          does — so every `position: sticky` box inside the shell was inert.
          Leaving overflow visible hands sticky the document scrollport, which
          is what --app-top-inset offsets are already written against.

          The top padding is dropped for the guest landing page, whose own
          header replaces the app header (see useIsGuestLanding).

          `min-w-0` replaces what `overflow-auto` used to do for width: a flex
          item's automatic minimum size is its content, so an over-wide child
          (a table, a long unbroken string) used to be absorbed by this
          element's own scrollbar. Now it is the document that scrolls
          sideways, and min-w-0 keeps the column itself from stretching. */}
      <main
        data-layout="app-shell-main"
        className={cn(
          'flex-1 min-w-0',
          isGuestLanding ? 'pt-0' : 'pt-[var(--app-header-height,3rem)]',
          'md:ml-[var(--sidebar-width)]'
        )}
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        {/* Mobile header with menu button. Sticks flush under the app chrome
            (header, or header + PWA banner) via --app-top-inset — matching the
            fixed header's height so the greeting below it is never overlapped. */}
        {showMobileMenuButton && (
          <div className="md:hidden p-4 border-b border-border bg-background/95 backdrop-blur-sm sticky top-[var(--app-top-inset,3rem)] z-30">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)}>
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
