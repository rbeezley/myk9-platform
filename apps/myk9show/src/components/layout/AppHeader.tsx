import React, { useState, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import {
  LogOut,
  User as UserIcon,
  ChevronDown,
  Search,
  Settings,
  CreditCard,
  Heart,
  Wifi,
  WifiOff,
  RefreshCw,
  ShoppingCart,
  Info,
  MessageSquare,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { CommandPalette } from '@/components/common/CommandPalette';
import { KeyboardShortcutsOverlay } from '@/components/common/KeyboardShortcutsOverlay';
import {
  useKeyboardShortcuts,
  getShortcutDisplays,
  type ShortcutDefinition,
} from '@/hooks/useKeyboardShortcuts';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ResetDataButton } from '@/components/common/ResetDataButton';
import { ClearCacheButton } from '@/components/common/ClearCacheButton';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
import { buildClasses } from '@/utils/designTokens';
import { useCartItemCount } from '@/stores/cartStore';
import { AboutDialog } from '@/components/common/AboutDialog';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';

const AppHeader: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut, userWithRoles, getUserRoles, hasRole } = useAuthContext();
  const globalSync = useGlobalSyncStatus();
  const networkStatus = useNetworkStatus();
  const navigate = useNavigate();
  const location = useLocation();
  // The marketing landing renders its own editorial sticky header
  // (LandingHeader). Suppressing this global app bar on `/` for guests
  // avoids two stacked headers.
  const isGuestLanding = !user && location.pathname === '/';
  // At-show ringside is a full-screen judge view on a phone (mirrors myK9Q's
  // standalone ringside). Suppress this global app bar so it doesn't eat
  // vertical space above the ringside page's own header.
  const isAtShow =
    location.pathname === '/at-show' || location.pathname.startsWith('/at-show/');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOverlayOpen, setShortcutsOverlayOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const cartItemCount = useCartItemCount();
  const { toggle: toggleAskQ } = useAskQPanelStore();

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);

  // Central keyboard shortcuts — independent of nav UI
  const shortcuts: ShortcutDefinition[] = useMemo(
    () => [
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
    [navigate, openCommandPalette]
  );

  useKeyboardShortcuts(shortcuts);
  const shortcutDisplays = useMemo(() => getShortcutDisplays(shortcuts), [shortcuts]);

  if (isGuestLanding) return null;
  if (isAtShow) return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background text-foreground border-border h-12 shadow-[var(--shadow-header)]">
      <div className="px-4 sm:px-6 h-full">
        <div className="flex items-center justify-between h-full">
          {/* Left: Logo */}
          <Link to="/" className="flex items-center">
            <span className="text-lg font-bold text-foreground tracking-tight">myK9Show</span>
          </Link>

          {/* Center: Search (desktop) */}
          {user && (
            <div className="hidden md:flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openCommandPalette()}
                className={`${buildClasses.button.ghost} flex items-center gap-2 px-3 py-1.5 bg-muted/50 hover:bg-muted/80 rounded-lg transition-colors`}
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCommandPaletteOpen(true)}
                  className="md:hidden p-1.5"
                  aria-label="Search"
                >
                  <Search className="h-4 w-4" />
                </Button>

                {/* Notifications */}
                <NotificationBell />

                {/* Cart Icon */}
                {cartItemCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/cart')}
                    className="p-1.5 relative"
                    aria-label="Shopping cart"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
                      {cartItemCount > 9 ? '9+' : cartItemCount}
                    </span>
                  </Button>
                )}

                {/* Theme Toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                  className="p-1.5 rounded-lg"
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

                {/* AskQ Assistant */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAskQ}
                  className="p-1.5 rounded-lg"
                  aria-label="AskQ Assistant"
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>

                {/* Profile Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild nativeButton>
                    <Button
                      variant="ghost"
                      className={`${buildClasses.button.ghost} flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg hover:bg-muted/50`}
                      aria-label="Account menu"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                        {user.email?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {/* User Info */}
                    <div className="px-3 py-2 border-b">
                      <p className="text-sm font-medium">{user.email}</p>
                      {userWithRoles && (
                        <div className="flex items-center gap-2 mt-1">
                          <UserIcon className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {getUserRoles()
                              .map(role =>
                                role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
                              )
                              .join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status Section */}
                    <div className="px-3 py-2 border-b">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          {networkStatus.isOnline ? (
                            <Wifi className="h-3 w-3 text-green-500" />
                          ) : (
                            <WifiOff className="h-3 w-3 text-red-500" />
                          )}
                          {networkStatus.isOnline ? 'Online' : 'Offline'}
                        </span>
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <RefreshCw
                            className={`h-3 w-3 ${globalSync.status === 'pending' ? 'animate-spin text-blue-500' : 'text-green-500'}`}
                          />
                          {globalSync.status === 'pending' ? 'Syncing...' : 'Synced'}
                        </span>
                      </div>
                    </div>

                    {/* Common menu items */}
                    <DropdownMenuItem asChild>
                      <Link to="/account" className="w-full flex items-center gap-2">
                        <UserIcon className="h-4 w-4" />
                        Account
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/subscription" className="w-full flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Subscription
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/pricing-page" className="w-full flex items-center gap-2">
                        <Heart className="h-4 w-4" />
                        Pricing
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={toggleAskQ}
                      className="w-full flex items-center gap-2 cursor-pointer"
                    >
                      <MessageSquare className="h-4 w-4" />
                      AskQ Assistant
                    </DropdownMenuItem>

                    {/* Role-specific menu items */}
                    {(hasRole(UserRole.SECRETARY) ||
                      hasRole(UserRole.CLUB_ADMIN) ||
                      hasRole(UserRole.SITE_ADMIN)) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link to="/judge-scoring" className="w-full flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Judge Scoring
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}

                    {hasRole(UserRole.SITE_ADMIN) && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/analytics" className="w-full flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Analytics
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/templates" className="w-full flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Template Management
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />

                    {/* Development Tools */}
                    {process.env.NODE_ENV === 'development' && (
                      <>
                        <div className="px-3 py-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            Development Tools
                          </p>
                        </div>
                        <div className="px-3 py-1">
                          <ResetDataButton />
                        </div>
                        <div className="px-3 py-1">
                          <ClearCacheButton />
                        </div>
                      </>
                    )}

                    <DropdownMenuItem onClick={() => setAboutOpen(true)} className="cursor-pointer">
                      <Info className="h-4 w-4 mr-2" />
                      About
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        signOut();
                      }}
                      className="text-red-600 dark:text-red-400"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
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
