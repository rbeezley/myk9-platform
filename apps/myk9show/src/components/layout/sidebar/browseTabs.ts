/**
 * The Browse lists: Shows, Dogs, People and Clubs. One rail item ("Browse") opens the one used
 * last, and a tablist above each list switches between them (docs/plan-sidebar-browse-pane.md,
 * phase 3). Each list keeps its own URL, so links, bookmarks and Back land on the right one.
 * An exhibitor-only account has no Browse: My Shows and My Dogs are two plain rail items, with no
 * tablist and no remembered tab (owner decision 2026-10-27, MYK9-1287; it replaced MYK9-1245).
 */

import { Building2, Calendar, Heart, Users } from 'lucide-react';
import { UserRole } from '@/types/auth-types';
import { rosterIsOwnDogsOnlyForRoles } from '@/utils/dogRosterScope';
import { isPathAllowedInCurrentSurface } from '@/config/surface';
import type { NavItem } from './types';

const BROWSE_TAB_IDS = ['shows', 'dogs', 'people', 'clubs'] as const;
export type BrowseTabId = (typeof BROWSE_TAB_IDS)[number];

function isBrowseTabId(value: unknown): value is BrowseTabId {
  return BROWSE_TAB_IDS.includes(value as BrowseTabId);
}

export interface BrowseTab extends NavItem {
  id: BrowseTabId;
}

const STORAGE_KEY = 'myk9:browse-last-tab';

function hasAnyRole(roles: readonly UserRole[], required: readonly UserRole[]): boolean {
  return required.some(role => roles.includes(role));
}

/** An exhibitor who holds none of the staff roles: the simplified sidebar, My Shows and My Dogs as their own rail items. */
export function isExhibitorOnlyRoles(roles: readonly UserRole[]): boolean {
  return (
    hasAnyRole(roles, [UserRole.EXHIBITOR]) &&
    !hasAnyRole(roles, [
      UserRole.JUDGE,
      UserRole.SECRETARY,
      UserRole.CLUB_ADMIN,
      UserRole.SITE_ADMIN,
    ])
  );
}

/**
 * The lists a set of roles can browse, in tab order. An exhibitor-only account browses none (My
 * Shows and My Dogs are plain rail items, not tabs); a site admin with no other role browses none
 * (their discovery lives in Admin). People and Clubs are secretary and site admin only (privacy,
 * navigation-ia.md). Roles only: whether the viewer is signed in at all is the caller's question.
 */
export function browseTabsForRoles(roles: readonly UserRole[]): BrowseTab[] {
  if (isExhibitorOnlyRoles(roles)) return [];
  const isPureSiteAdmin = roles.length === 1 && roles[0] === UserRole.SITE_ADMIN;
  if (isPureSiteAdmin) return [];

  const tabs: BrowseTab[] = [
    { id: 'shows', title: 'Shows', href: '/shows', icon: Calendar },
    // The label follows the roster scope: a judge's Dogs list holds only their own dogs.
    {
      id: 'dogs',
      title: rosterIsOwnDogsOnlyForRoles(roles) ? 'My Dogs' : 'Dogs',
      href: '/dogs',
      icon: Heart,
    },
  ];
  if (hasAnyRole(roles, [UserRole.SECRETARY, UserRole.SITE_ADMIN])) {
    tabs.push(
      { id: 'people', title: 'People', href: '/people', icon: Users },
      { id: 'clubs', title: 'Clubs', href: '/clubs', icon: Building2 }
    );
  }
  return tabs;
}

/**
 * The tabs to draw: the role's lists, less any the deployment surface 404s (the wizard surface
 * serves only its allowlist). A site admin is never gated, as in the sidebar's own filter.
 */
export function visibleBrowseTabs(
  roles: readonly UserRole[],
  isPathAllowed: (path: string) => boolean = isPathAllowedInCurrentSurface
): BrowseTab[] {
  const tabs = browseTabsForRoles(roles);
  return roles.includes(UserRole.SITE_ADMIN) ? tabs : tabs.filter(tab => isPathAllowed(tab.href));
}

/** The list a path belongs to (`/dogs/123` is Dogs), or null outside the Browse lists. */
export function browseTabForPath(pathname: string): BrowseTabId | null {
  const segment = pathname.split('/')[1];
  return isBrowseTabId(segment) ? segment : null;
}

/**
 * The remembered list, a per-device convenience. Storage can throw (private window, blocked
 * site data) or hold anything; either way the answer is "none", and Browse opens Shows.
 */
export function readLastBrowseTab(): BrowseTabId | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isBrowseTabId(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeLastBrowseTab(id: BrowseTabId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // A lost memory only means Browse opens Shows next time.
  }
}

/**
 * Where the Browse rail item goes: the list open now, else the one used last if this account can
 * still see it, else the first (Shows).
 */
export function browseHref(
  tabs: readonly BrowseTab[],
  currentId: BrowseTabId | null,
  lastId: BrowseTabId | null
): string {
  const pick = (id: BrowseTabId | null) => (id ? tabs.find(tab => tab.id === id) : undefined);
  return (pick(currentId) ?? pick(lastId) ?? tabs[0])?.href ?? '/shows';
}
