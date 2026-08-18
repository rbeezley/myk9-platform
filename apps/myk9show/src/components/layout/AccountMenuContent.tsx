import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CircleAlert,
  CircleCheck,
  Code2,
  Info,
  LifeBuoy,
  LogOut,
  RefreshCw,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getSignOutGuardMode } from '@/components/layout/signOutGuard';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { helpUrl } from '@/lib/help';
import { resetAllMockData } from '@/utils/debugUtils';
import { clearDevelopmentCache } from '@/utils/clearDevelopmentCache';
import { AskQIcon } from '@/components/layout/AskQIcon';

interface AccountMenuContentProps {
  /** Opens the About dialog owned by the shared account-menu host. */
  onAbout: () => void;
  align?: 'start' | 'center' | 'end';
}

function AccountMenuSeparator() {
  return <DropdownMenuSeparator className="bg-muted-foreground/40" />;
}

/** Shared account dropdown body used by the mobile header and desktop sidebar. */
export function AccountMenuContent({ onAbout, align = 'end' }: AccountMenuContentProps) {
  const { user, signOut, userWithRoles, getUserRoles } = useAuthContext();
  const globalSync = useGlobalSyncStatus();
  const networkStatus = useNetworkStatus();
  const { toggle: toggleAskQ } = useAskQPanelStore();
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [signOutWarningOpen, setSignOutWarningOpen] = useState(false);

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

  // MYK9-202: signing out destroys the session AND the persisted RBAC cache,
  // and sign-in needs the auth server — so a signed-out device at an offline
  // venue is locked out of a show fully replicated on its own disk. Warn at
  // the click; documentation is not a guard.
  const signOutGuardMode = getSignOutGuardMode({ isOffline, roles: getUserRoles() });
  const hasUnsyncedChanges = isSaving || needsAttention;

  const handleSignOutClick = () => {
    if (signOutGuardMode === 'none') {
      signOut();
      return;
    }
    setSignOutWarningOpen(true);
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
    <DropdownMenuContent align={align} className="w-64">
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
        onClick={handleSignOutClick}
        closeOnClick={signOutGuardMode === 'none'}
        className="focus:bg-destructive/10 focus:text-destructive"
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sign out
      </DropdownMenuItem>
      <AlertDialog open={signOutWarningOpen} onOpenChange={setSignOutWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {signOutGuardMode === 'offline' ? "You're offline" : 'Sign out before a show?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {signOutGuardMode === 'offline'
                ? 'If you sign out now, you cannot sign back in until you have internet again.'
                : 'If you lose internet at the show site, you cannot sign back in until it returns. Stay signed in unless this is a shared device.'}
              {signOutGuardMode === 'offline' && hasUnsyncedChanges
                ? " You also have changes on this device that haven't synced yet."
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setSignOutWarningOpen(false);
                signOut();
              }}
            >
              Sign out anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DropdownMenuContent>
  );
}
