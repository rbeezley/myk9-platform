import { Link } from 'react-router-dom';
import {
  CreditCard,
  Heart,
  Info,
  LifeBuoy,
  LogOut,
  MessageSquare,
  RefreshCw,
  Settings,
  User as UserIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { ResetDataButton } from '@/components/common/ResetDataButton';
import { ClearCacheButton } from '@/components/common/ClearCacheButton';
import { helpUrl } from '@/lib/help';

interface AccountMenuContentProps {
  /** Opens the About dialog, whose state lives in the host AppHeader. */
  onAbout: () => void;
}

/** The account dropdown's menu body. Extracted from AppHeader so that file
 * stays under the 500-line ratchet; it re-derives everything it needs from
 * hooks, so the only coupling back to the header is the About dialog toggle. */
export function AccountMenuContent({ onAbout }: AccountMenuContentProps) {
  const { user, signOut, userWithRoles, getUserRoles, hasRole } = useAuthContext();
  const globalSync = useGlobalSyncStatus();
  const networkStatus = useNetworkStatus();
  const { toggle: toggleAskQ } = useAskQPanelStore();

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
      <DropdownMenuItem onClick={onAbout} className="cursor-pointer">
        <Info className="h-4 w-4 mr-2" />
        About
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => {
          signOut();
        }}
        className="text-destructive "
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
