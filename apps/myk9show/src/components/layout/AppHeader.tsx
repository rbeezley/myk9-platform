import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { LogOut, User as UserIcon, ChevronDown, Search, Settings, CreditCard, Heart, Wifi, WifiOff, RefreshCw, Menu, X, Palette } from 'lucide-react';
import { PreferencesDialog } from '@/components/preferences';
import { ExhibitorNavigation, SecretaryNavigation, JudgeNavigation, AdminNavigation } from './navigation';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { CommandPalette } from '@/components/common/CommandPalette';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ResetDataButton } from '@/components/common/ResetDataButton';
import { ClearCacheButton } from '@/components/common/ClearCacheButton';
import { NotificationCenter } from '@/components/common/NotificationCenter';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
import { buildClasses } from '@/utils/designTokens';

const AppHeader: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut, userWithRoles, getUserRoles, hasRole } = useAuthContext();
  const globalSync = useGlobalSyncStatus();
  const networkStatus = useNetworkStatus();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Handler for opening command palette
  const openCommandPalette = () => {
    setCommandPaletteOpen(true);
  };


  // Keyboard shortcut for command palette
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openCommandPalette();
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);


  // Render appropriate navigation based on user role
  const renderRoleBasedNavigation = () => {
    if (!user) return null;

    // Priority order: Site Admin > Club Admin > Secretary > Judge > Exhibitor
    if (hasRole(UserRole.SITE_ADMIN)) {
      return <AdminNavigation />;
    } else if (hasRole(UserRole.CLUB_ADMIN) || hasRole(UserRole.SECRETARY)) {
      return <SecretaryNavigation />;
    } else if (hasRole(UserRole.JUDGE)) {
      return <JudgeNavigation />;
    } else {
      return <ExhibitorNavigation />;
    }
  };

  // Get user's primary role for display
  const getPrimaryRole = () => {
    if (hasRole(UserRole.SITE_ADMIN)) return 'Admin';
    if (hasRole(UserRole.CLUB_ADMIN)) return 'Club Admin';
    if (hasRole(UserRole.SECRETARY)) return 'Secretary';
    if (hasRole(UserRole.JUDGE)) return 'Judge';
    return 'Exhibitor';
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-lg text-foreground border-border h-16 transition-all duration-300 supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full">
          
          {/* Left: Logo + Primary Navigation */}
          <div className="flex items-center gap-8">
            {/* Logo */}
            <Link to="/" className="flex items-center">
              <span className="text-xl font-bold text-primary tracking-tight">myK9Show</span>
            </Link>
            
            {/* Role-Based Navigation */}
            {renderRoleBasedNavigation()}
          </div>

          {/* Center: Search */}
          {user && (
            <div className="hidden lg:flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openCommandPalette()}
                className={`${buildClasses.button.ghost} flex items-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted/80 rounded-lg transition-colors`}
              >
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Search...</span>
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs font-mono bg-background/50 rounded border text-muted-foreground">
                  ⌘K
                </kbd>
              </Button>
            </div>
          )}

          {/* Right: User Controls - Simplified for 15" laptops */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {/* Mobile Menu Toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-2"
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>

                {/* Mobile Search */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCommandPaletteOpen(true)}
                  className="lg:hidden p-2"
                >
                  <Search className="h-4 w-4" />
                </Button>

                {/* Notification Center */}
                <NotificationCenter />

                {/* Theme Toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                  className="p-2 rounded-lg"
                >
                  {theme === 'dark' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
                      <path d="M21 12.79A9 9 0 0112.79 3a1 1 0 00-1.06 1.28A7 7 0 1019.72 13.85a1 1 0 001.28-1.06z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
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

                {/* Profile Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className={`${buildClasses.button.ghost} flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/50`}>
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
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
                            {getUserRoles().map(role =>
                              role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
                            ).join(', ')}
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
                          <RefreshCw className={`h-3 w-3 ${globalSync.status === 'syncing' ? 'animate-spin text-blue-500' : 'text-green-500'}`} />
                          {globalSync.status === 'syncing' ? 'Syncing...' : 'Synced'}
                        </span>
                      </div>
                    </div>

                    {/* Common menu items for all users */}
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
                    <DropdownMenuItem onClick={() => setPreferencesOpen(true)} className="w-full flex items-center gap-2 cursor-pointer">
                      <Palette className="h-4 w-4" />
                      Preferences
                    </DropdownMenuItem>

                    {/* Role-specific menu items */}
                    {(hasRole(UserRole.SECRETARY) || hasRole(UserRole.CLUB_ADMIN) || hasRole(UserRole.SITE_ADMIN)) && (
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
                          <p className="text-xs font-medium text-muted-foreground">Development Tools</p>
                        </div>
                        <div className="px-3 py-1">
                          <ResetDataButton />
                        </div>
                        <div className="px-3 py-1">
                          <ClearCacheButton />
                        </div>
                      </>
                    )}
                    
                    <DropdownMenuItem onClick={signOut} className="text-red-600 dark:text-red-400">
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
                  className={`${buildClasses.button.ghost} px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors`}
                >
                  Sign In
                </Link>
                <Link 
                  to="/sign-up" 
                  className={`${buildClasses.button.primary} px-4 py-2 rounded-lg font-medium transition-colors text-sm`}
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && user && (
        <div className="md:hidden border-t bg-background/95 backdrop-blur-lg">
          <div className="px-4 py-3 space-y-2">
            {renderRoleBasedNavigation()}
          </div>
        </div>
      )}

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />

      {/* Preferences Dialog */}
      <PreferencesDialog
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
      />
    </nav>
  );
};

export default AppHeader;
