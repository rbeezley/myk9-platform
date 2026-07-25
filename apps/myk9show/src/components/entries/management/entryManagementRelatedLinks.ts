import type { RelatedContextLinkItem } from '@/components/common/RelatedContextLinks';

export interface EntryManagementRelatedLinksInput {
  isStaff: boolean;
  showId: string | null | undefined;
  trialFilter: string | null;
  classFilter: string | null;
  /** IDs of classes already loaded for the active trial filter — the class
   * link only renders when `classFilter` is one of these, so the link never
   * points at a class the page hasn't actually loaded/verified for this trial. */
  loadedTrialClassIds: readonly string[];
}

/**
 * Related-context links shown near Entry Management's existing
 * `FilterBreadcrumb`: when a trial filter is active, link to Trial Details;
 * when a class filter is also active, link to that class's Class Details
 * page. Built entirely from loaded filter state — no new queries.
 */
export function buildEntryManagementRelatedLinks({
  isStaff,
  showId,
  trialFilter,
  classFilter,
  loadedTrialClassIds,
}: EntryManagementRelatedLinksInput): RelatedContextLinkItem[] {
  if (!isStaff || !showId || !trialFilter) {
    return [];
  }

  const items: RelatedContextLinkItem[] = [
    {
      key: 'trial-details',
      label: 'Trial Details',
      href: `/shows/${encodeURIComponent(showId)}/trials/${encodeURIComponent(trialFilter)}`,
    },
  ];

  if (classFilter && loadedTrialClassIds.includes(classFilter)) {
    items.push({
      key: 'class-details',
      label: 'Class Details',
      href: `/shows/${encodeURIComponent(showId)}/trials/${encodeURIComponent(trialFilter)}/classes/${encodeURIComponent(classFilter)}`,
    });
  }

  return items;
}
