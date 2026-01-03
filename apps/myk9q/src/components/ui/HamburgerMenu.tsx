import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAnnouncementStore } from '../../stores/announcementStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSafeLogout } from '../../hooks/useSafeLogout';
import { Menu, X, Home as HomeIcon, Inbox, Monitor, Settings as SettingsIcon, BookOpen, Sun, Moon, Smartphone, Info, BarChart3, MessageSquare, Building2, Trophy, ClipboardList } from 'lucide-react';
import { AboutDialog } from '../dialogs/AboutDialog';
import { AskMyK9Q } from '../chatbot/AskMyK9Q';
import { PendingScoresWarningDialog } from '../dialogs/PendingScoresWarningDialog';
import './shared-ui.css';
import { productVersion } from '../../config/appVersion';

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
  currentPage?: 'home' | 'announcements' | 'settings' | 'stats' | 'entries' | 'tv' | 'show' | 'results' | 'secretary';
  /** Additional CSS classes for the menu button */
  className?: string;
}

export const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
  backNavigation,
  currentPage,
  className = ''
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [_isAnimating, setIsAnimating] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isAskMyK9QOpen, setIsAskMyK9QOpen] = useState(false);

  const navigate = useNavigate();
  const { settings, updateSettings } = useSettingsStore();
  const { showContext, role } = useAuth();
  const { unreadCount: _announcementUnreadCount, setLicenseKey, currentLicenseKey } = useAnnouncementStore();
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
        className={`menu-button ${className}`}
        onClick={handleMenuToggle}
        title="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Menu Overlay - Rendered at document root using Portal */}
      {isMenuOpen && createPortal(
        <div
          className="menu-overlay"
          onClick={() => setIsMenuOpen(false)}
        >
          <nav
            className="hamburger-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="menu-header">
              <div className="menu-header-info">
                <h3>{showContext?.clubName}</h3>
                <p className="show-info-detail">{showContext?.showName}</p>
                <p className="user-info">
                  Logged in as: <span>{role}</span>
                </p>
              </div>
              <button 
                className="menu-close"
                onClick={() => setIsMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="menu-items">
              {/* Back Navigation (if provided) */}
              {backNavigation && (
                <>
                  <button
                    className="menu-item"
                    onClick={() => handleMenuItemClick(backNavigation.action)}
                  >
                    <span className="menu-icon">←</span>
                    <span>{backNavigation.label}</span>
                  </button>
                  <div className="menu-divider"></div>
                </>
              )}

              {/* Main Navigation - Event Context */}
              <button
                className={`menu-item ${currentPage === 'home' ? 'active' : ''}`}
                onClick={() => handleMenuItemClick(() => navigate('/home'))}
              >
                <HomeIcon className="menu-icon" />
                <span>Home</span>
              </button>

              <button
                className={`menu-item ${currentPage === 'show' ? 'active' : ''}`}
                onClick={() => handleMenuItemClick(() => navigate(`/show/${showContext?.licenseKey}`))}
              >
                <Building2 className="menu-icon" />
                <span>Show Details</span>
              </button>

              {/* Show-related */}
              <button
                className={`menu-item ${currentPage === 'stats' ? 'active' : ''}`}
                onClick={() => handleMenuItemClick(() => navigate('/stats'))}
              >
                <BarChart3 className="menu-icon" />
                <span>Statistics</span>
              </button>

              <button
                className={`menu-item ${currentPage === 'results' ? 'active' : ''}`}
                onClick={() => handleMenuItemClick(() => navigate('/results'))}
              >
                <Trophy className="menu-icon" />
                <span>The Podium</span>
              </button>

              <div className="menu-divider"></div>

              {/* Communication */}
              <button
                className={`menu-item ${currentPage === 'announcements' ? 'active' : ''}`}
                onClick={() => handleMenuItemClick(() => navigate('/announcements'))}
              >
                <BookOpen className="menu-icon" />
                <span>Announcements</span>
              </button>

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(() => togglePanel())}
              >
                <div className="menu-icon-container">
                  <Inbox className="menu-icon" />
                  {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                  )}
                </div>
                <span>Inbox</span>
              </button>

              {/* Tools */}
              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(() => setIsAskMyK9QOpen(true))}
              >
                <MessageSquare className="menu-icon" />
                <span>AskQ</span>
              </button>

              {/* Secretary Tools - Available to all roles (read-only for non-admin) */}
              <button
                className={`menu-item ${currentPage === 'secretary' ? 'active' : ''}`}
                onClick={() => handleMenuItemClick(() => navigate('/secretary'))}
              >
                <ClipboardList className="menu-icon" />
                <span>Secretary Tools</span>
              </button>

              {/* Admin Section - Only show for admin users */}
              {role === 'admin' && (
                <>
                  <div className="menu-divider"></div>
                  <button
                    className={`menu-item menu-item--desktop-only ${currentPage === 'tv' ? 'active' : ''}`}
                    onClick={() => handleMenuItemClick(() => navigate(`/tv/${showContext?.licenseKey || 'myK9Q1-d8609f3b-d3fd43aa-6323a604'}`))}
                  >
                    <Monitor className="menu-icon" />
                    <span>TV Display</span>
                  </button>
                </>
              )}

              <div className="menu-divider"></div>

              {/* Configuration */}
              <button
                className={`menu-item ${currentPage === 'settings' ? 'active' : ''}`}
                onClick={() => handleMenuItemClick(() => navigate('/settings'))}
              >
                <SettingsIcon className="menu-icon" />
                <span>Settings</span>
              </button>

              <button
                className="menu-item"
                onClick={cycleTheme}
              >
                <themeDisplay.icon className="menu-icon" />
                <span>{themeDisplay.label}</span>
              </button>

              <button
                className="menu-item"
                onClick={() => handleMenuItemClick(() => setIsAboutDialogOpen(true))}
              >
                <Info className="menu-icon" />
                <span>About</span>
              </button>

              <div className="menu-divider"></div>

              {/* Logout */}
              <button
                className="menu-item logout"
                onClick={() => handleMenuItemClick(() => safeLogout())}
              >
                <span>Logout</span>
              </button>

              {/* Version Number */}
              <div className="menu-version">
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
      <AskMyK9Q
        isOpen={isAskMyK9QOpen}
        onClose={() => setIsAskMyK9QOpen(false)}
      />

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