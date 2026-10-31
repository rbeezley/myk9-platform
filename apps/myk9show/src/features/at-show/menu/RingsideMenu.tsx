/**
 * The ringside menu (MYK9-1508): v3's hamburger, on the class list and entry
 * list only. Every item links to an existing surface; none is rebuilt here.
 *
 * INTENT: this is a way to somewhere, never a way out. The Up control
 * (MYK9-1500) stays the only exit from ringside; destinations return the user
 * to the ringside screen they came from (RingsideReturnBar), and the Message
 * Center and AskQ open over the screen without leaving it.
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { AskQPanel } from '@/components/askq/AskQPanel';
import { SignOutWarningDialog } from '@/components/layout/SignOutWarningDialog';
import { getSignOutGuardMode, type SignOutWarningContext } from '@/components/layout/signOutGuard';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
import { useOnlineStatus } from '@/lib/networkUtils';
import { cn } from '@/lib/utils';
import { replicatedShowsTable } from '@/services/replication';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { useMessageStore } from '@/store/messageStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { useIsStaffDogViewer } from '../useStaffDogGate';
import {
  OFFLINE_ITEM_NOTICE,
  buildRingsideMenuItems,
  itemNeedsConnection,
  type RingsideMenuItem,
} from './ringsideMenuItems';
import { useRingsideReturnStore } from './ringsideReturnStore';
import { RingsideShowInfo } from './RingsideShowInfo';

const ROW_CLASS =
  'flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:opacity-60';

export function RingsideMenu({ showId }: { showId: string | undefined }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, getUserRoles } = useAuthContext();
  const isOnline = useOnlineStatus();
  const globalSync = useGlobalSyncStatus();
  const setReturn = useRingsideReturnStore(s => s.set);
  const [open, setOpen] = useState(false);
  const [showInfoOpen, setShowInfoOpen] = useState(false);
  // AskQ's panel (and its hooks) mounts on first use, not with every class list.
  const [askqMounted, setAskqMounted] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [signOutWarning, setSignOutWarning] = useState<SignOutWarningContext | null>(null);

  // Same query key the class list uses, so this reads the cache.
  const showQuery = useQuery({
    queryKey: ['at-show', 'show', showId],
    queryFn: () => replicatedShowsTable.getShowById(showId as string),
    enabled: !!showId,
    networkMode: 'always',
  });
  // The destination route's own gate, so the link and the page cannot disagree.
  const canManageShow = useShowManageScope(showId).canManage;
  const isStaff = useIsStaffDogViewer(showId);

  const unread =
    useNotificationStore(s => s.unreadCount) +
    useAnnouncementStore(s => s.unreadCount) +
    useMessageStore(s => s.unreadCount);

  const items = buildRingsideMenuItems({
    showId,
    canManageShow,
    isOnline,
    hasAccount: Boolean(user) && !user?.is_anonymous,
    isNationals: showQuery.data ? showQuery.data.isNationals === true : null,
    isStaff,
  });

  // A slide-out closes before the next overlay or navigation begins.
  const closeThen = (next: () => void) => {
    setPending(() => next);
    setOpen(false);
  };

  const guardedSignOut = () => {
    const mode = getSignOutGuardMode({
      isOffline: !isOnline || globalSync.status === 'offline',
      roles: getUserRoles(),
    });
    if (mode === 'none') {
      signOut();
      return;
    }
    setSignOutWarning({
      mode,
      hasUnsyncedChanges:
        globalSync.status === 'pending' ||
        globalSync.status === 'error' ||
        globalSync.status === 'conflict' ||
        globalSync.queueSize > 0,
    });
  };

  const activate = (item: RingsideMenuItem) => {
    if (itemNeedsConnection(item, isOnline)) return;
    if (item.action === 'show-info') {
      setShowInfoOpen(value => !value);
      return;
    }
    if (item.href) {
      const href = item.href;
      setReturn({
        returnTo: `${location.pathname}${location.search}`,
        scope: item.returnScope ?? href.split('?')[0] ?? href,
      });
      closeThen(() => navigate(href));
      return;
    }
    if (item.action === 'announcements')
      closeThen(() => useNotificationStore.getState().openCenter());
    if (item.action === 'askq')
      closeThen(() => {
        setAskqMounted(true);
        useAskQPanelStore.getState().open();
      });
    if (item.action === 'sign-out') closeThen(guardedSignOut);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ringside menu"
        aria-haspopup="dialog"
        className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Menu className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span
            className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
            aria-label={`${unread} unread`}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <SlideOverPanel
        open={open}
        onClose={() => setOpen(false)}
        onExited={() => {
          const next = pending;
          setPending(null);
          next?.();
        }}
        title="Menu"
        side="left"
        size="sm"
      >
        <nav aria-label="Ringside menu" className="space-y-1">
          {items.map(item => {
            const Icon = item.icon;
            const offline = itemNeedsConnection(item, isOnline);
            const isShowInfo = item.action === 'show-info';
            return (
              <div key={item.id}>
                <button
                  type="button"
                  className={ROW_CLASS}
                  aria-disabled={offline || undefined}
                  aria-expanded={isShowInfo ? showInfoOpen : undefined}
                  onClick={() => activate(item)}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    {item.label}
                    {offline && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {OFFLINE_ITEM_NOTICE}
                      </span>
                    )}
                  </span>
                  {item.id === 'announcements' && unread > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                      {unread} unread
                    </span>
                  )}
                  {isShowInfo && (
                    <ChevronDown
                      className={cn('h-4 w-4 transition-transform', showInfoOpen && 'rotate-180')}
                      aria-hidden
                    />
                  )}
                </button>
                {isShowInfo && showInfoOpen && (
                  <RingsideShowInfo
                    showId={showId}
                    location={showQuery.data?.location ?? null}
                    isOnline={isOnline}
                  />
                )}
              </div>
            );
          })}
        </nav>
      </SlideOverPanel>
      {askqMounted && <AskQPanel />}
      <SignOutWarningDialog
        context={signOutWarning}
        onCancel={() => setSignOutWarning(null)}
        onConfirm={() => {
          setSignOutWarning(null);
          signOut();
        }}
      />
    </>
  );
}
