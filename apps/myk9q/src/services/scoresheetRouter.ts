/**
 * Scoresheet Router Service
 *
 * Centralized routing logic for navigating to organization-specific scoresheets.
 * Implements a 4-tier hierarchy for scoresheet selection:
 * 1. Organization (AKC, UKC, ASCA)
 * 2. Activity Type (Scent Work, Obedience, Rally, etc.)
 * 3. Element (from class definition)
 * 4. Level (Novice, Advanced, Excellent, Masters)
 */

import { parseOrganizationData } from '../utils/organizationUtils';

export interface ScoresheetRouteParams {
  org: string;
  element?: string;
  level?: string;
  classId: number;
  entryId: number | string; // Can be 0 or '0' for auto-select first entry
  competition_type?: string; // 'Regular', 'Regional', 'National'
}

/**
 * Gets the scoresheet route for a specific entry
 * @param params - Routing parameters including organization, element, class, and entry IDs
 * @returns The route path to the appropriate scoresheet
 */
export function getScoresheetRoute(params: ScoresheetRouteParams): string {
  const { org, element = '', classId, entryId } = params;
  const orgData = parseOrganizationData(org);

  // AKC Organization
  if (orgData.organization === 'AKC') {
    if (orgData.activity_type === 'Scent Work' || orgData.activity_type === 'ScentWork') {
      return `/scoresheet/akc-scent-work/${classId}/${entryId}`;
    } else if (orgData.activity_type === 'FastCat' || orgData.activity_type === 'Fast Cat') {
      return `/scoresheet/akc-fastcat/${classId}/${entryId}`;
    } else {
      // Default AKC fallback
      return `/scoresheet/akc-scent-work/${classId}/${entryId}`;
    }
  }

  // UKC Organization
  if (orgData.organization === 'UKC') {
    if (orgData.activity_type === 'Obedience' || element === 'Obedience') {
      return `/scoresheet/ukc-obedience/${classId}/${entryId}`;
    } else if (element === 'Rally' || orgData.activity_type === 'Rally') {
      return `/scoresheet/ukc-rally/${classId}/${entryId}`;
    } else if (orgData.activity_type === 'Nosework') {
      // UKC Nosework - dedicated scoresheet
      return `/scoresheet/ukc-nosework/${classId}/${entryId}`;
    } else {
      // UKC fallback based on element
      if (element === 'Obedience') {
        return `/scoresheet/ukc-obedience/${classId}/${entryId}`;
      } else {
        return `/scoresheet/ukc-rally/${classId}/${entryId}`;
      }
    }
  }

  // ASCA Organization
  if (orgData.organization === 'ASCA') {
    return `/scoresheet/asca-scent-detection/${classId}/${entryId}`;
  }

  // Default fallback for unknown organizations
  if (element === 'Obedience') {
    return `/scoresheet/ukc-obedience/${classId}/${entryId}`;
  } else if (element === 'Rally') {
    return `/scoresheet/ukc-rally/${classId}/${entryId}`;
  } else {
    // Ultimate fallback
    return `/scoresheet/ukc-obedience/${classId}/${entryId}`;
  }
}

/**
 * Gets the scoresheet slug (e.g., 'akc-scent-work', 'ukc-obedience')
 * Useful for conditional logic based on scoresheet type
 */
export function getScoresheetSlug(org: string, element?: string): string {
  const orgData = parseOrganizationData(org);

  if (orgData.organization === 'AKC') {
    if (orgData.activity_type === 'Scent Work' || orgData.activity_type === 'ScentWork') {
      return 'akc-scent-work';
    } else if (orgData.activity_type === 'FastCat' || orgData.activity_type === 'Fast Cat') {
      return 'akc-fastcat';
    }
    return 'akc-scent-work';
  }

  if (orgData.organization === 'UKC') {
    if (orgData.activity_type === 'Obedience' || element === 'Obedience') {
      return 'ukc-obedience';
    } else if (element === 'Rally' || orgData.activity_type === 'Rally') {
      return 'ukc-rally';
    }
    return 'ukc-obedience';
  }

  if (orgData.organization === 'ASCA') {
    return 'asca-scent-detection';
  }

  return 'ukc-obedience'; // Default fallback
}
