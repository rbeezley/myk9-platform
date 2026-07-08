import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ChevronDown, Search, ShoppingCart, MessageSquare, Menu } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { CommandPalette } from '@/components/common/CommandPalette';
import { KeyboardShortcutsOverlay } from '@/components/common/KeyboardShortcutsOverlay';
import {
  useKeyboardShortcuts,
  getShortcutDisplays,
  type ShortcutDefinition,
} from '@/hooks/useKeyboardShortcuts';
import { buildClasses } from '@/utils/designTokens';
import { useCartItemCount, useCartStore } from '@/store/cartStore';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { AboutDialog } from '@/components/common/AboutDialog';
import { AccountMenuContent } from '@/components/layout/AccountMenuContent';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { useCurrentUserPerson } from '@/hooks/useProfileForm';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAppShellMobileNav } from './useAppShellMobileNav';

const MOBILE_SIDEBAR_QUERY = '(max-width: 767px)';

function useIsMobileSidebarViewport() {
  const [isMobileSidebarViewport, setIsMobileSidebarViewport] = useState(() =>
    typeof window === 'undefined' || !window.matchMedia
      ? false
      : window.matchMedia(MOBILE_SIDEBAR_QUERY).matches
  );

  useEffect(() => {
    if (!window.matchMedia) return;

    const mediaQuery = window.matchMedia(MOBILE_SIDEBAR_QUERY);
    const updateViewport = () => setIsMobileSidebarViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  return isMobileSidebarViewport;
}

const AppHeader: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuthContext();
  const { data: currentPerson } = useCurrentUserPerson(user?.id);
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobileNavOpen, openMobileNav } = useAppShellMobileNav();
  const isMobileSidebarViewport = useIsMobileSidebarViewport();
  // The marketing landing renders its own editorial sticky header
  // (LandingHeader). Suppressing this global app bar on `/` for guests
  // avoids two stacked headers.
  const isGuestLanding = !user && location.pathname === '/';
  const isOnboardingRoute =
    location.pathname === '/onboarding' || location.pathname.startsWith('/onboarding/');
  // At-show ringside is a full-screen judge view on a phone (mirrors myK9Q's
  // standalone ringside). Suppress this global app bar so it doesn't eat
  // vertical space above the ringside page's own header.
  const isAtShow = location.pathname === '/at-show' || location.pathname.startsWith('/at-show/');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOverlayOpen, setShortcutsOverlayOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const cartItemCount = useCartItemCount();
  const { toggle: toggleAskQ } = useAskQPanelStore();

  // exhibitor-ux-remediation (cart-integrity): the cart badge only reflected
  // whatever the in-memory store happened to hold, which stayed empty
  // everywhere except /cart itself (the only place that hydrated it) — so a
  // cart drafted in a prior session was invisible on every other page. Hydrate
  // once per session for signed-in exhibitors so a non-empty cart is always
  // discoverable, not just after visiting /cart directly.
  //
  // Codex review (PR #1217): this hydration is UNSCOPED (loadActiveCart picks
  // the exhibitor's most-recent active cart across all shows), so it must NOT
  // run on routes that own a SHOW-SCOPED cart load — the registration wizard
  // (ClassSelectionStep's loadCart/createCart), the cart page, and checkout.
  // On those routes an unscoped load can resolve last and overwrite the
  // show-specific cart, so subsequent addItem calls target the wrong cart.
  // Elsewhere (dashboard, dogs, etc.) it's purely for the badge and is safe.
  const { profile: exhibitorProfile } = useExhibitorProfile();
  const loadActiveCart = useCartStore(state => state.loadActiveCart);
  const cartLoadInitiated = useCartStore(state => state.loadInitiated);
  const ownsScopedCart =
    location.pathname.startsWith('/cart') ||
    location.pathname.startsWith('/checkout') ||
    /^\/shows\/[^/]+\/register/.test(location.pathname);
  useEffect(() => {
    if (exhibitorProfile?.id && !cartLoadInitiated && !ownsScopedCart) {
      loadActiveCart(exhibitorProfile.id);
    }
  }, [exhibitorProfile?.id, cartLoadInitiated, ownsScopedCart, loadActiveCart]);

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);

  // Central keyboard shortcuts — independent of nav UI
  const shortcuts: ShortcutDefinition[] = useMemo(
    () =>
      isOnboardingRoute
        ? []
        : [
            {
              id: 'command-palette',
              label: 'Open command palette',
              keys: 'Meta+K',
              category: 'general',
              action: openCommandPalette,
              global: true,
            },
            {
              id: 'shortcuts-overlay',
              label: 'Show keyboard shortcuts',
              keys: '?',
              category: 'general',
              action: () => setShortcutsOverlayOpen(true),
            },
            {
              id: 'go-dogs',
              label: 'Go to Dogs',
              keys: 'G D',
              category: 'navigation',
              action: () => navigate('/dogs'),
            },
            {
              id: 'go-people',
              label: 'Go to People',
              keys: 'G P',
              category: 'navigation',
              action: () => navigate('/people'),
            },
            {
              id: 'go-shows',
              label: 'Go to Shows',
              keys: 'G S',
              category: 'navigation',
              action: () => navigate('/shows'),
            },
            {
              id: 'go-clubs',
              label: 'Go to Clubs',
              keys: 'G C',
              category: 'navigation',
              action: () => navigate('/clubs'),
            },
            {
              id: 'create-dog',
              label: 'Create Dog',
              keys: 'C D',
              category: 'actions',
              action: () => navigate('/dogs?add=true'),
            },
            {
              id: 'create-person',
              label: 'Create Person',
              keys: 'C P',
              category: 'actions',
              action: () => navigate('/people?add=true'),
            },
            {
              id: 'create-show',
              label: 'New Show',
              keys: 'C S',
              category: 'actions',
              action: () => navigate('/?wizard=true'),
            },
          ],
    [isOnboardingRoute, navigate, openCommandPalette]
  );

  useKeyboardShortcuts(shortcuts);
  const shortcutDisplays = useMemo(() => getShortcutDisplays(shortcuts), [shortcuts]);

  if (isGuestLanding) return null;
  if (isAtShow) return null;

  return (
    <nav className="fixed top-[var(--pwa-banner-height,0px)] left-0 right-0 z-50 border-b bg-background text-foreground border-border h-12 shadow-[var(--shadow-header)]">
      <div className="px-4 sm:px-6 h-full">
        <div className="flex items-center justify-between h-full">
          {/* Left: Mobile navigation + logo */}
          <div className="flex min-w-0 items-center gap-2">
            {user &&
              !isOnboardingRoute &&
              openMobileNav &&
              isMobileSidebarViewport &&
              !isMobileNavOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openMobileNav}
                  className="md:hidden -ml-2 min-h-11 min-w-11 rounded-lg p-2"
                  aria-label="Open navigation"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
            <Link to="/" className="flex min-h-11 min-w-0 items-center">
              <span className="truncate text-lg font-bold text-foreground tracking-tight">
                myK9Show
              </span>
            </Link>
          </div>

          {/* Center: Search (desktop) */}
          {user && !isOnboardingRoute && (
            <div className="hidden md:flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openCommandPalette()}
                className={`${buildClasses.button.ghost} flex min-h-11 items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 transition-colors hover:bg-muted/80`}
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Search...</span>
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs font-mono bg-background/50 rounded border text-muted-foreground">
                  ⌘K
                </kbd>
              </Button>
            </div>
          )}

          {/* Right: Utility Controls */}
          <div className="flex items-center gap-1">
            {user ? (
              <>
                {/* Mobile Search */}
                {!isOnboardingRoute && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCommandPaletteOpen(true)}
                    className="min-h-11 min-w-11 p-2 md:hidden"
                    aria-label="Search"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                )}

                {/* Notifications */}
                {!isOnboardingRoute && <NotificationBell />}

                {/* Cart Icon */}
                {!isOnboardingRoute && cartItemCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/cart')}
                    className="relative min-h-11 min-w-11 p-2"
                    aria-label="Shopping cart"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
                      {cartItemCount > 9 ? '9+' : cartItemCount}
                    </span>
                  </Button>
                )}

                {/* Theme Toggle */}
                {!isOnboardingRoute && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleTheme}
                    className="min-h-11 min-w-11 rounded-lg p-2"
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        className="w-4 h-4"
                      >
                        <path d="M21 12.79A9 9 0 0112.79 3a1 1 0 00-1.06 1.28A7 7 0 1019.72 13.85a1 1 0 001.28-1.06z" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        className="w-4 h-4"
                      >
                        <circle cx="12" cy="12" r="5" />
                        <g stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="1" x2="12" y2="3" />
                          <line x1="12" y1="21" x2="12" y2="23" />
                          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                          <line x1="1" y1="12" x2="3" y2="12" />
                          <line x1="21" y1="12" x2="23" y2="12" />
                          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </g>
                      </svg>
                    )}
                  </Button>
                )}

                {/* AskQ Assistant */}
                {!isOnboardingRoute && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleAskQ}
                    className="min-h-11 min-w-11 rounded-lg p-2"
                    aria-label="AskQ Assistant"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                )}

                {/* Profile Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild nativeButton>
                    <Button
                      variant="ghost"
                      className={`${buildClasses.button.ghost} flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg px-2 py-2 hover:bg-muted/50`}
                      aria-label="Account menu"
                    >
                      <Avatar className="w-7 h-7">
                        {currentPerson?.profileImage && (
                          <AvatarImage src={currentPerson.profileImage} alt="Profile photo" />
                        )}
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                          {user.email?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
                    </Button>
                  </DropdownMenuTrigger>
                  <AccountMenuContent onAbout={() => setAboutOpen(true)} />
                </DropdownMenu>
              </>
            ) : (
              <>
                <Link
                  to="/sign-in"
                  className={`${buildClasses.button.ghost} px-3 py-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors`}
                >
                  Sign In
                </Link>
                <Link
                  to="/sign-up"
                  className={`${buildClasses.button.primary} px-3 py-1.5 rounded-lg font-medium transition-colors text-sm`}
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />

      {/* Keyboard Shortcuts Overlay */}
      <KeyboardShortcutsOverlay
        open={shortcutsOverlayOpen}
        onOpenChange={setShortcutsOverlayOpen}
        shortcuts={shortcutDisplays}
      />

      {/* About Dialog */}
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </nav>
  );
};

export default AppHeader;
