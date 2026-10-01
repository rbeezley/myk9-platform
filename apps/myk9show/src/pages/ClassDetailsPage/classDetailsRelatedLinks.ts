import { getSetupClassesHref } from '@/pages/secretary/showSetupSections';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import type { RelatedContextLinkItem } from '@/components/common/RelatedContextLinks';

export interface ClassDetailsRelatedLinksInput {
  isStaff: boolean;
  showId: string | null | undefined;
  trialId: string | null | undefined;
  classId: string | null | undefined;
}

/**
 * Related-context links for Class Details, beyond what the existing
 * Show -> Trial -> Class breadcrumb already covers: Class Management
 * (scoped to the trial) and Entry Management (scoped to this class).
 *
 * Staff-gated. Only renders a link when every ID it needs is already
 * loaded — no link is built from a partially-loaded class.
 */
export function buildClassDetailsRelatedLinks({
  isStaff,
  showId,
  trialId,
  classId,
}: ClassDetailsRelatedLinksInput): RelatedContextLinkItem[] {
  if (!isStaff || !showId) {
    return [];
  }

  const items: RelatedContextLinkItem[] = [];

  items.push({
    key: 'class-management',
    label: 'Setup → Classes',
    href: getSetupClassesHref(showId),
  });

  if (classId) {
    items.push({
      key: 'entry-management',
      label: 'Entry Management',
      href: getEntryManagementHref({ showId, trialId: trialId ?? null, classId }),
    });
  }

  return items;
}
