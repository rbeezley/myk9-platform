/**
 * BrowseTabs — the switch between the Browse lists (Shows, Dogs, People, Clubs), above the list.
 *
 * INTENT: each tab is its list's own URL, so links, bookmarks and Back land on the right list, and
 * the one Browse rail item stays current on all four (docs/plan-sidebar-browse-pane.md, phase 3).
 * A real tablist: arrow keys, Home and End move between tabs and the URL follows.
 */

import React, { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { isAccountSession } from '@/hooks/guestServerRead';
import { useEmbeddedDetail } from './embeddedDetail';
import { browseTabForPath, visibleBrowseTabs, type BrowseTabId } from './sidebar/browseTabs';

const PANEL_ID = 'browse-tabpanel';
const tabElementId = (id: BrowseTabId) => `browse-tab-${id}`;

// Navigation state set by an arrow-key switch. That switch usually mounts the next list's page,
// and this tablist with it, so the state is what carries focus to the new tab.
const FOCUS_TAB_STATE = { browseTabFocus: true } as const;

function wantsTabFocus(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'browseTabFocus' in state;
}

interface BrowseTabsProps {
  children: React.ReactNode;
  /** Classes for the tabpanel around the list; page lists keep `PageShell`'s vertical rhythm. */
  panelClassName?: string;
  tablistClassName?: string;
}

/**
 * Renders the tablist and wraps `children` (the list) as its tabpanel. Renders `children` alone
 * where there is no switch to offer: signed out, a role with fewer than two lists (a judge's Dogs
 * only, or a deployment surface that serves fewer), or inside a detail pane (Find Shows beside
 * the Shows list). An exhibitor-only account switches between My Shows and My Dogs.
 */
export function BrowseTabs({
  children,
  panelClassName = 'space-y-6',
  tablistClassName,
}: BrowseTabsProps) {
  const { user, userWithRoles } = useAuthContext();
  const embedded = useEmbeddedDetail();
  const { pathname } = useLocation();
  const tabs = isAccountSession(user) ? visibleBrowseTabs(userWithRoles?.roles ?? []) : [];
  const selectedId = browseTabForPath(pathname);
  const selected = tabs.find(tab => tab.id === selectedId);

  if (embedded || tabs.length < 2 || !selected) return <>{children}</>;

  return (
    <>
      <BrowseTablist
        tabs={tabs.map(({ id, title, href }) => ({ id, title, href }))}
        selectedId={selected.id}
        className={tablistClassName}
      />
      <div
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={tabElementId(selected.id)}
        className={panelClassName}
      >
        {children}
      </div>
    </>
  );
}

interface TablistTab {
  id: BrowseTabId;
  title: string;
  href: string;
}

function BrowseTablist({
  tabs,
  selectedId,
  className,
}: {
  tabs: TablistTab[];
  selectedId: BrowseTabId;
  className?: string | undefined;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);
  const focusTab = wantsTabFocus(location.state);

  useEffect(() => {
    if (!focusTab) return;
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [focusTab, location.key]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const from = tabs.findIndex(tab => tab.id === selectedId);
    const last = tabs.length - 1;
    const to =
      event.key === 'ArrowRight'
        ? (from + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (from - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (to === -1 || to === from) return;
    event.preventDefault();
    navigate(tabs[to].href, { state: FOCUS_TAB_STATE });
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Browse"
      onKeyDown={handleKeyDown}
      // Full width on a phone, so four tabs share the row; its own width from `sm`.
      className={cn('flex w-full rounded-lg bg-muted p-1 sm:inline-flex sm:w-auto', className)}
    >
      {tabs.map(tab => {
        const selected = tab.id === selectedId;
        return (
          <Link
            key={tab.id}
            id={tabElementId(tab.id)}
            to={tab.href}
            role="tab"
            aria-selected={selected}
            aria-controls={selected ? PANEL_ID : undefined}
            tabIndex={selected ? 0 : -1}
            className={cn(
              'flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.title}
          </Link>
        );
      })}
    </div>
  );
}
