/**
 * Hook for determining active navigation path in role sidebars.
 *
 * Handles exact matching, child-route disambiguation, and dashboard-only
 * exact matching. Used by all role-based sidebars.
 */

import { useLocation } from 'react-router-dom';
import type { NavGroup } from './types';

function parseNavHref(href: string): { pathname: string; searchParams: URLSearchParams } {
  const [pathname, search = ''] = href.split('?');
  return { pathname, searchParams: new URLSearchParams(search) };
}

function matchesSearchParams(expected: URLSearchParams, actual: URLSearchParams): boolean {
  return [...expected].every(([key, value]) => actual.getAll(key).includes(value));
}

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
  const locationSearchParams = new URLSearchParams(location.search);

  return (href: string): boolean => {
    const { pathname: hrefPathname, searchParams: hrefSearchParams } = parseNavHref(href);

    if (location.pathname === hrefPathname) {
      if (hrefSearchParams.size > 0) {
        return matchesSearchParams(hrefSearchParams, locationSearchParams);
      }

      const hasMatchingFilteredHref = allHrefs.some(otherHref => {
        if (otherHref === href) return false;
        const parsedOtherHref = parseNavHref(otherHref);
        return (
          parsedOtherHref.pathname === hrefPathname &&
          parsedOtherHref.searchParams.size > 0 &&
          matchesSearchParams(parsedOtherHref.searchParams, locationSearchParams)
        );
      });
      return !hasMatchingFilteredHref;
    }

    // A query-bearing link represents a filtered listing, not every child
    // route beneath that listing's pathname.
    if (hrefSearchParams.size > 0) return false;

    const hasMoreSpecificRoute = allHrefs.some(otherHref => {
      const { pathname: otherPathname } = parseNavHref(otherHref);
      return (
        otherHref !== href &&
        otherPathname.startsWith(hrefPathname + '/') &&
        location.pathname.startsWith(otherPathname)
      );
    });
    if (hasMoreSpecificRoute) return false;

    if (href === dashboardHref) return location.pathname === hrefPathname;

    return location.pathname.startsWith(hrefPathname + '/');
  };
}
