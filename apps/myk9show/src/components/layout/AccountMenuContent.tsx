import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CircleAlert,
  CircleCheck,
  Code2,
  CreditCard,
  Info,
  LifeBuoy,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  User as UserIcon,
  WifiOff,
} from 'lucide-react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { useTheme } from '@/hooks/useTheme';
import { helpUrl } from '@/lib/help';
import { resetAllMockData } from '@/utils/debugUtils';
import { clearDevelopmentCache } from '@/utils/clearDevelopmentCache';
import { AskQIcon } from '@/components/layout/AskQIcon';

interface AccountMenuContentProps {
  /** Opens the About dialog, whose state lives in the host AppHeader. */
  onAbout: () => void;
}

function AccountMenuSeparator() {
  return <DropdownMenuSeparator className="bg-muted-foreground/40" />;
}

/** The account dropdown's menu body. Extracted from AppHeader so that file
 * stays under the 500-line ratchet; it re-derives everything it needs from
 * hooks, so the only coupling back to the header is the About dialog toggle. */
export function AccountMenuContent({ onAbout }: AccountMenuContentProps) {
  const { user, signOut, userWithRoles, getUserRoles, hasRole } = useAuthContext();
  const globalSync = useGlobalSyncStatus();
  const networkStatus = useNetworkStatus();
  const { toggle: toggleAskQ } = useAskQPanelStore();
  const { theme, toggleTheme } = useTheme();
  const [isClearingCache, setIsClearingCache] = useState(false);

  const isOffline = !networkStatus.isOnline || globalSync.status === 'offline';
  const needsAttention = globalSync.status === 'error' || globalSync.status === 'conflict';
  const isSaving = globalSync.status === 'pending';
  const StatusIcon = isOffline
    ? WifiOff
    : needsAttention
      ? CircleAlert
      : isSaving
        ? RefreshCw
        : CircleCheck;
  const statusLabel = isOffline
    ? 'Offline — changes saved here'
    : needsAttention
      ? 'Some changes need attention'
      : isSaving
        ? 'Saving changes...'
        : 'All changes saved';

  const handleResetData = () => {
    if (
      window.confirm(
        'Reset shared development data? This preserves templates and UI preferences, then reloads the page.'
      )
    ) {
      resetAllMockData();
    }
  };

  const handleClearCache = async () => {
    if (
      !window.confirm('Clear development cache and browser storage? This will reload the page.')
    ) {
      return;
    }

    setIsClearingCache(true);
    const didClear = await clearDevelopmentCache();
    if (!didClear) {
      setIsClearingCache(false);
    }
  };

  return (
    <DropdownMenuContent align="end" className="w-64">
      {/* User Info */}
      <div className="px-3 py-2 border-b">
        <p className="text-sm font-medium">{user?.email}</p>
        {userWithRoles && (
          <div className="flex items-center gap-2 mt-1">
            <UserIcon className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {getUserRoles()
                .map(role => role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()))
                .join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Status Section */}
      <div className="px-3 py-2 border-b">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <StatusIcon
            className={`h-3 w-3 ${isSaving ? 'animate-spin text-blue-500' : needsAttention ? 'text-destructive' : isOffline ? '' : 'text-green-500'}`}
          />
          {statusLabel}
        </span>
      </div>

      {/* Common menu items */}
      <DropdownMenuItem asChild>
        <Link to="/account" className="w-full flex items-center gap-2">
          <UserIcon className="h-4 w-4" />
          Account
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        {/* Billing now lives as a section on the unified account page; the
            standalone /subscription route is kept only for Stripe checkout
            redirects. */}
        <Link to="/account?section=billing" className="w-full flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Plan &amp; billing
        </Link>
      </DropdownMenuItem>

      {/* Role-specific menu items */}
      {(hasRole(UserRole.SECRETARY) ||
        hasRole(UserRole.CLUB_ADMIN) ||
        hasRole(UserRole.SITE_ADMIN)) && (
        <>
          <AccountMenuSeparator />
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
      <AccountMenuSeparator />

      {/* AskQ stays here as the labeled compact-width access path for the
          same panel action exposed by the desktop header button. */}
      <DropdownMenuItem
        onClick={toggleAskQ}
        className="w-full flex items-center gap-2 cursor-pointer"
      >
        <AskQIcon className="h-4 w-4" />
        AskQ
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a
          href={helpUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-2 cursor-pointer"
        >
          <LifeBuoy className="h-4 w-4" />
          Help &amp; Guides
        </a>
      </DropdownMenuItem>
      <AccountMenuSeparator />

      <DropdownMenuItem
        onClick={toggleTheme}
        className="w-full flex items-center gap-2 cursor-pointer"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onAbout} className="cursor-pointer">
        <Info className="h-4 w-4 mr-2" />
        About
      </DropdownMenuItem>

      {/* Development Tools */}
      {process.env.NODE_ENV === 'development' && (
        <>
          <AccountMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <Code2 className="h-4 w-4" />
              Developer
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuItem onClick={handleResetData} className="cursor-pointer">
                <RefreshCw className="h-4 w-4" />
                Reset Data
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void handleClearCache();
                }}
                disabled={isClearingCache}
                className="cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${isClearingCache ? 'animate-spin' : ''}`} />
                {isClearingCache ? 'Clearing Cache...' : 'Clear Cache'}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </>
      )}
      <AccountMenuSeparator />
      <DropdownMenuItem
        onClick={() => {
          signOut();
        }}
        className="focus:bg-destructive/10 focus:text-destructive"
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
