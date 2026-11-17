import { getShowDeskClassHref } from '@/features/show-map/cockpit/cockpitRoutes';
import { getSelectClassesHref } from '@/pages/secretary/selectClassesRoutes';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import type { RelatedContextLinkItem } from '@/components/common/RelatedContextLinks';

export interface ClassDetailsRelatedLinksInput {
  isStaff: boolean;
  showId: string | null | undefined;
  trialId: string | null | undefined;
  classId: string | null | undefined;
  /** The class's trial date; Show Desk focuses a class only on its own day. */
  classDay?: string | null | undefined;
}

/**
 * Related-context links for Class Details. For staff the first is "Open on Show Desk": a class is
 * run there (MYK9-2119), and this page is the exhibitor's view of it. Beyond what the existing
 * Show -> Trial -> Class breadcrumb already covers: Setup -> Classes
 * (scoped to the trial, this class focused) and Entry Management (scoped to this class).
 *
 * Staff-gated. Only renders a link when every ID it needs is already
 * loaded — no link is built from a partially-loaded class.
 */
export function buildClassDetailsRelatedLinks({
  isStaff,
  showId,
  trialId,
  classId,
  classDay,
}: ClassDetailsRelatedLinksInput): RelatedContextLinkItem[] {
  if (!isStaff || !showId) {
    return [];
  }

  const items: RelatedContextLinkItem[] = [];

  if (classId) {
    items.push({
      key: 'show-desk',
      label: 'Open on Show Desk',
      href: getShowDeskClassHref({ showId, classId, day: classDay }),
    });
  }

  items.push({
    key: 'class-management',
    label: 'Select classes',
    href: getSelectClassesHref(showId, undefined, {
      trialId: trialId ?? undefined,
      focusClassId: classId ?? undefined,
    }),
  });

  if (classId) {
    items.push({
      key: 'entry-management',
      label: 'Entry Forms',
      href: getEntryManagementHref({ showId, trialId: trialId ?? null, classId }),
    });
  }

  return items;
}
