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
import type { ClassMenuAction } from '@myk9/ringside';
import { replicatedShowsTable, replicatedTrialsTable } from '@/services/replication';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { useMessageStore } from '@/store/messageStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { useDogViewerKind } from '../useStaffDogGate';
import { isExhibitorOnlyForAtShow } from '../myAtShowEntryDetails.helpers';
import { setupSheetRegistryIds } from '../setupSheetRegistries';
import {
  OFFLINE_ITEM_NOTICE,
  buildRingsideMenuItems,
  itemNeedsConnection,
  type RingsideMenuItem,
} from './ringsideMenuItems';
import { useRingsideReturnStore, type RingsideListSnapshot } from './ringsideReturnStore';
import { RingsideShowInfo } from './RingsideShowInfo';
import { useRestoreRingsideScroll } from './useRingsideListSnapshot';

const ROW_CLASS =
  'flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:opacity-60';

export function RingsideMenu({
  showId,
  snapshot,
  classActions = [],
}: {
  showId: string | undefined;
  snapshot?: RingsideListSnapshot;
  /**
   * The entry list's actions on its class (MYK9-1697, D6), listed first under
   * "This class". The entry list has this one menu; it no longer draws a ⋮.
   */
  classActions?: readonly ClassMenuAction[];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  useRestoreRingsideScroll(snapshot !== undefined);
  const { user, signOut, getUserRoles, hasRole } = useAuthContext();
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
  const dogViewerKind = useDogViewerKind(showId);
  // Its own small read of the trials replica (works offline and on a cold
  // entry-list deep link, where the class list's cache is empty).
  const trialsQuery = useQuery({
    queryKey: ['at-show', 'trials', showId],
    queryFn: () => replicatedTrialsTable.getTrialsByShow(showId as string),
    enabled: !!showId,
    networkMode: 'always',
  });
  const hasSetupSheet =
    !isExhibitorOnlyForAtShow(hasRole) &&
    setupSheetRegistryIds((trialsQuery.data ?? []).map(trial => ({ trial }))).length > 0;

  const unread =
    useNotificationStore(s => s.unreadCount) +
    useAnnouncementStore(s => s.unreadCount) +
    useMessageStore(s => s.unreadCount);
  const unreadBadge = unread > 9 ? '9+' : String(unread);

  const items = buildRingsideMenuItems({
    showId,
    canManageShow,
    isOnline,
    hasAccount: Boolean(user) && !user?.is_anonymous,
    isNationals: showQuery.data ? showQuery.data.isNationals === true : null,
    isStaff: dogViewerKind === 'staff',
    canFindDogs: dogViewerKind !== null,
    hasSetupSheet,
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
        ...(snapshot && { state: { ringsideList: snapshot, scrollY: window.scrollY } }),
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
        // The visible badge text is part of the name (axe label-content-name-mismatch);
        // since MYK9-1697 this badge is the only on-screen sign of new announcements.
        aria-label={unread > 0 ? `Ringside menu, ${unreadBadge} unread` : 'Ringside menu'}
        aria-haspopup="dialog"
        className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Menu className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unreadBadge}
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
        // INTENT: rendered inside the entry-list header (`sticky z-10`), which would trap the
        // panel inside that stacking context and cover Close (MYK9-1666).
        portal
      >
        {classActions.length > 0 && (
          <section aria-labelledby="ringside-menu-this-class" className="mb-3 border-b pb-3">
            <h3
              id="ringside-menu-this-class"
              className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              This class
            </h3>
            <div className="space-y-1">
              {classActions.map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={ROW_CLASS}
                    disabled={action.disabled}
                    aria-disabled={action.disabled || undefined}
                    onClick={() => closeThen(action.onSelect)}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
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
      {askqMounted && <AskQPanel portal />}
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
