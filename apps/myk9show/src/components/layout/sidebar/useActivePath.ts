/**
 * Hook for determining active navigation path in role sidebars.
 *
 * Handles exact matching, child-route disambiguation, and dashboard-only
 * exact matching. Used by all role-based sidebars.
 */

import { useLocation } from 'react-router-dom';
import type { NavGroup } from './types';

/**
 * Pre-compute all navigation hrefs from a list of nav groups.
 * Call this once outside of a component, not on every render.
 */
export function collectNavHrefs(groups: NavGroup[]): string[] {
  return groups.flatMap(group => group.items.map(item => item.href));
}

/**
 * Returns an `isActive(href)` function that checks whether a given
 * nav href should be highlighted for the current location.
 *
 * @param allHrefs - Pre-computed array from `collectNavHrefs`
 * @param dashboardHref - The dashboard route for this role (exact-match only)
 */
export function useActivePath(allHrefs: string[], dashboardHref: string) {
  const location = useLocation();

  return (href: string): boolean => {
    if (location.pathname === href) return true;

    const hasMoreSpecificRoute = allHrefs.some(
      otherHref =>
        otherHref !== href &&
        otherHref.startsWith(href + '/') &&
        location.pathname.startsWith(otherHref)
    );
    if (hasMoreSpecificRoute) return false;

    if (href === dashboardHref) return location.pathname === href;

    return location.pathname.startsWith(href + '/') || location.pathname === href;
  };
}
