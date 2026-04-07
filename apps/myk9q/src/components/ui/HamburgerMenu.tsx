import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAnnouncementStore } from '../../stores/announcementStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSafeLogout } from '../../hooks/useSafeLogout';
import {
  Menu,
  X,
  Home as HomeIcon,
  Inbox,
  Monitor,
  Settings as SettingsIcon,
  BookOpen,
  Sun,
  Moon,
  Smartphone,
  Info,
  BarChart3,
  MessageSquare,
  Building2,
  Trophy,
} from 'lucide-react';
import { AboutDialog } from '../dialogs/AboutDialog';
import { AskMyK9Q } from '../chatbot/AskMyK9Q';
import { PendingScoresWarningDialog } from '../dialogs/PendingScoresWarningDialog';
import { productVersion } from '../../config/appVersion';
import { cn } from '../../lib/utils';

/** Reusable menu item styles */
const menuItemStyles = {
  base: cn(
    'flex items-center gap-3 w-full px-6 py-3.5',
    'bg-transparent border-none text-[var(--foreground)]',
    'text-[0.9375rem] font-medium cursor-pointer text-left min-h-[48px]',
    'transition-all duration-200 ease-in-out',
    'hover:bg-[var(--muted)]'
  ),
  active: 'bg-[rgba(0,122,255,0.1)] text-[var(--primary)] font-semibold',
  logout: 'text-[var(--error)] mt-auto hover:bg-[rgba(239,68,68,0.1)]',
  icon: 'w-5 h-5 shrink-0',
  divider: 'h-px bg-[var(--border)] mx-6 my-2',
};

/**
 * HamburgerMenu Component
 *
 * A slide-out navigation menu that appears from the left side of the viewport.
 *
 * Architecture:
 * - Uses React Portal to render the menu overlay at document.body level
 * - This ensures the menu is always positioned relative to the viewport, not parent containers
 * - Desktop pages with .page-container margins won't affect menu positioning
 * - Provides consistent behavior across all pages
 *
 * @example
 * <HamburgerMenu currentPage="home" />
 */
interface HamburgerMenuProps {
  /** Optional back navigation - if provided, shows as first menu item */
  backNavigation?: {
    label: string;
    action: () => void;
  };
  /** Current page to highlight in menu */
  currentPage?:
    | 'home'
    | 'announcements'
    | 'settings'
    | 'stats'
    | 'entries'
    | 'tv'
    | 'show'
    | 'results';
  /** Additional CSS classes for the menu button */
  className?: string;
}

export const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
  backNavigation,
  currentPage,
  className = '',
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [_isAnimating, setIsAnimating] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isAskMyK9QOpen, setIsAskMyK9QOpen] = useState(false);

  const navigate = useNavigate();
  const { settings, updateSettings } = useSettingsStore();
  const { showContext, role } = useAuth();
  const {
    unreadCount: _announcementUnreadCount,
    setLicenseKey,
    currentLicenseKey,
  } = useAnnouncementStore();
  const { unreadCount, togglePanel } = useNotifications();

  // Safe logout - prevents data loss from pending scores/mutations and warns about offline logout
  const {
    safeLogout,
    forceLogout,
    showWarningDialog,
    warningType,
    closeWarningDialog,
    pendingScoreCount,
    pendingMutationCount,
    isOnline,
    isSyncing,
  } = useSafeLogout();

  // Initialize announcement store with current show context
  useEffect(() => {
    if (showContext?.licenseKey && currentLicenseKey !== showContext.licenseKey) {
      setLicenseKey(showContext.licenseKey, showContext.showName);
    }
  }, [showContext, currentLicenseKey, setLicenseKey]);

  // Cycle through theme modes: light → dark → auto → light
  const cycleTheme = () => {
    const cycle: Record<string, 'light' | 'dark' | 'auto'> = {
      light: 'dark',
      dark: 'auto',
      auto: 'light',
    };
    const nextTheme = cycle[settings.theme] || 'light';
    updateSettings({ theme: nextTheme });
  };

  // Get theme icon and label for current setting
  const getThemeDisplay = () => {
    switch (settings.theme) {
      case 'light':
        return { icon: Sun, label: 'Light Mode' };
      case 'dark':
        return { icon: Moon, label: 'Dark Mode' };
      case 'auto':
        return { icon: Smartphone, label: 'Auto (System)' };
      default:
        return { icon: Sun, label: 'Light Mode' };
    }
  };

  const themeDisplay = getThemeDisplay();

  const handleMenuItemClick = (action: () => void) => {
    // Close menu first to prevent click-through to underlying elements
    setIsMenuOpen(false);
    // Execute action after a brief delay to ensure menu is unmounting
    setTimeout(() => action(), 50);
  };

  // Handle menu opening with animation
  const handleMenuToggle = () => {
    if (!isMenuOpen) {
      setIsMenuOpen(true);
      setIsAnimating(true);
      // Reset animation state after animation completes
      setTimeout(() => setIsAnimating(false), 300);
    } else {
      setIsMenuOpen(false);
    }
  };

  return (
    <>
      <button
        className={cn(
          'bg-[var(--secondary)] border border-[var(--border)] rounded-xl p-3',
          'text-[var(--secondary-foreground)] cursor-pointer',
          'transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          'min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0',
          'hover:bg-[var(--muted)] hover:-translate-y-px hover:shadow-md',
          'dark:bg-[var(--muted)] dark:text-[var(--foreground)]',
          'dark:hover:bg-[var(--secondary)] dark:hover:shadow-lg',
          className
        )}
        onClick={handleMenuToggle}
        title="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Menu Overlay - Rendered at document root using Portal */}
      {isMenuOpen &&
        createPortal(
          <div
            className={cn(
              'fixed inset-0 bg-black/30 z-[9999] animate-fade-in',
              'light:bg-black/20'
            )}
            onClick={() => setIsMenuOpen(false)}
          >
            <nav
              className={cn(
                'fixed top-0 left-0 w-[280px] h-screen',
                'bg-[var(--card)] shadow-[4px_0_12px_rgba(0,0,0,0.15)]',
                'animate-slide-in-left flex flex-col z-[10000]',
                'dark:shadow-[4px_0_12px_rgba(0,0,0,0.3)]'
              )}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between p-6 border-b border-[var(--border)]">
                <div className="flex-1 min-w-0 overflow-hidden">
                  <h3 className="m-0 mb-1 text-lg font-bold text-[var(--foreground)] truncate">
                    {showContext?.clubName}
                  </h3>
                  <p className="m-0 mb-2 text-sm text-[var(--token-text-secondary)] font-medium">
                    {showContext?.showName}
                  </p>
                  <p className="m-0 text-[0.8125rem] text-[var(--muted-foreground)] font-normal">
                    Logged in as: <span className="text-[var(--primary)] font-medium">{role}</span>
                  </p>
                </div>
                <button
                  className={cn(
                    'flex items-center justify-center w-8 h-8',
                    'bg-transparent border-none rounded-md',
                    'text-[var(--muted-foreground)] cursor-pointer',
                    'transition-all duration-200 ease-in-out',
                    'hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                  )}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 py-4 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch]">
                {/* Back Navigation (if provided) */}
                {backNavigation && (
                  <>
                    <button
                      className={menuItemStyles.base}
                      onClick={() => handleMenuItemClick(backNavigation.action)}
                    >
                      <span className={menuItemStyles.icon}>←</span>
                      <span>{backNavigation.label}</span>
                    </button>
                    <div className={menuItemStyles.divider} />
                  </>
                )}

                {/* Main Navigation - Event Context */}
                <button
                  className={cn(
                    menuItemStyles.base,
                    currentPage === 'home' && menuItemStyles.active
                  )}
                  onClick={() => handleMenuItemClick(() => navigate('/home'))}
                >
                  <HomeIcon className={menuItemStyles.icon} />
                  <span>Home</span>
                </button>

                <button
                  className={cn(
                    menuItemStyles.base,
                    currentPage === 'show' && menuItemStyles.active
                  )}
                  onClick={() =>
                    handleMenuItemClick(() => navigate(`/show/${showContext?.licenseKey}`))
                  }
                >
                  <Building2 className={menuItemStyles.icon} />
                  <span>Show Details</span>
                </button>

                {/* Show-related */}
                <button
                  className={cn(
                    menuItemStyles.base,
                    currentPage === 'stats' && menuItemStyles.active
                  )}
                  onClick={() => handleMenuItemClick(() => navigate('/stats'))}
                >
                  <BarChart3 className={menuItemStyles.icon} />
                  <span>Statistics</span>
                </button>

                <button
                  className={cn(
                    menuItemStyles.base,
                    currentPage === 'results' && menuItemStyles.active
                  )}
                  onClick={() => handleMenuItemClick(() => navigate('/results'))}
                >
                  <Trophy className={menuItemStyles.icon} />
                  <span>The Podium</span>
                </button>

                <div className={menuItemStyles.divider} />

                {/* Communication */}
                <button
                  className={cn(
                    menuItemStyles.base,
                    currentPage === 'announcements' && menuItemStyles.active
                  )}
                  onClick={() => handleMenuItemClick(() => navigate('/announcements'))}
                >
                  <BookOpen className={menuItemStyles.icon} />
                  <span>Announcements</span>
                </button>

                <button
                  className={menuItemStyles.base}
                  onClick={() => handleMenuItemClick(() => togglePanel())}
                >
                  <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                    <Inbox className={menuItemStyles.icon} />
                    {unreadCount > 0 && (
                      <span
                        className={cn(
                          'absolute -top-1.5 -right-1.5 bg-[var(--destructive)] text-white',
                          'text-[0.6875rem] font-semibold leading-none',
                          'min-w-4 h-4 rounded-md flex items-center justify-center px-1',
                          'shadow-sm border border-[var(--card)]'
                        )}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  <span>Inbox</span>
                </button>

                {/* Tools */}
                <button
                  className={menuItemStyles.base}
                  onClick={() => handleMenuItemClick(() => setIsAskMyK9QOpen(true))}
                >
                  <MessageSquare className={menuItemStyles.icon} />
                  <span>AskQ</span>
                </button>

                {/* Admin Section - Only show for admin users */}
                {role === 'admin' && (
                  <>
                    <div className={menuItemStyles.divider} />
                    <button
                      className={cn(
                        menuItemStyles.base,
                        'hidden lg:flex',
                        currentPage === 'tv' && menuItemStyles.active
                      )}
                      onClick={() =>
                        handleMenuItemClick(() =>
                          navigate(
                            `/tv/${showContext?.licenseKey || 'myK9Q1-d8609f3b-d3fd43aa-6323a604'}`
                          )
                        )
                      }
                    >
                      <Monitor className={menuItemStyles.icon} />
                      <span>TV Display</span>
                    </button>
                  </>
                )}

                <div className={menuItemStyles.divider} />

                {/* Configuration */}
                <button
                  className={cn(
                    menuItemStyles.base,
                    currentPage === 'settings' && menuItemStyles.active
                  )}
                  onClick={() => handleMenuItemClick(() => navigate('/settings'))}
                >
                  <SettingsIcon className={menuItemStyles.icon} />
                  <span>Settings</span>
                </button>

                <button className={menuItemStyles.base} onClick={cycleTheme}>
                  <themeDisplay.icon className={menuItemStyles.icon} />
                  <span>{themeDisplay.label}</span>
                </button>

                <button
                  className={menuItemStyles.base}
                  onClick={() => handleMenuItemClick(() => setIsAboutDialogOpen(true))}
                >
                  <Info className={menuItemStyles.icon} />
                  <span>About</span>
                </button>

                <div className={menuItemStyles.divider} />

                {/* Logout */}
                <button
                  className={cn(menuItemStyles.base, menuItemStyles.logout)}
                  onClick={() => handleMenuItemClick(() => safeLogout())}
                >
                  <span>Logout</span>
                </button>

                {/* Version Number */}
                <div className="text-center px-6 pt-4 pb-2 text-xs text-[var(--muted-foreground)] font-medium opacity-70">
                  v{productVersion}
                </div>
              </div>
            </nav>
          </div>,
          document.body
        )}

      {/* About Dialog */}
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onClose={() => setIsAboutDialogOpen(false)}
        licenseKey={showContext?.licenseKey}
      />

      {/* AskQ Chatbot */}
      <AskMyK9Q isOpen={isAskMyK9QOpen} onClose={() => setIsAskMyK9QOpen(false)} />

      {/* Pending Scores Warning Dialog (also handles offline and pending changes warnings) */}
      <PendingScoresWarningDialog
        isOpen={showWarningDialog}
        onClose={closeWarningDialog}
        warningType={warningType}
        pendingCount={pendingScoreCount}
        pendingMutationCount={pendingMutationCount}
        isOnline={isOnline}
        isSyncing={isSyncing}
        onForceLogout={forceLogout}
      />
    </>
  );
};
