import { useEffect, useMemo } from 'react';
import { browseTabForPath, writeLastBrowseTab } from './browseTabs';
import type { SidebarConfig } from './types';
import { collectNavHrefs, useActivePath } from './useActivePath';

/**
 * Remembers the Browse list in use whenever one is open, however the viewer got there (a tab, a
 * link, a bookmark) and at every width: called from the app layout, which is mounted whether the
 * desktop rail or the phone drawer is showing, so a list visited on a phone is the one Browse
 * opens on a wider screen. Read through the sidebar's `isActive`, not the pathname, so a club
 * admin's own Club Profile (`/clubs/<their club>`) stays My Club's and is not remembered as Clubs.
 */
export function useRememberBrowseList(config: SidebarConfig): void {
  const allHrefs = useMemo(() => collectNavHrefs(config.groups), [config.groups]);
  const isActive = useActivePath(allHrefs, config.dashboardHref);
  const browseItems = config.groups.find(group => group.railLink)?.items ?? [];
  const activeItem = browseItems.find(item => isActive(item.href));
  const activeId = activeItem ? browseTabForPath(activeItem.href) : null;

  useEffect(() => {
    if (activeId) writeLastBrowseTab(activeId);
  }, [activeId]);
}
