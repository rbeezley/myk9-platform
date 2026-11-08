import type { AskQGuideAsset } from './documentContext.ts';
import type { AskQQuestionMode } from './types.ts';

// MYK9-1775: the secretary and club-admin guides document management actions
// (Remove entry, refunds, approvals) that an exhibitor must never be offered as
// their own. Callers without a show-management role get the other guides only.
export const MANAGEMENT_GUIDE_IDS: ReadonlySet<string> = new Set([
  'secretary-guide',
  'club-admin-guide',
]);

export interface RoleScopedGuideClient {
  rpc(name: 'is_show_manager'): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Runs as the caller (user-JWT client). `is_show_manager()` is true for site
 * admins and for club-scoped secretaries and club admins, the helper the
 * dogs/people RLS uses. Secretary appointments are club-scoped only: being
 * named on one show grants nothing (20260830240000), so there is no show-scoped
 * secretary shape to recognize. Fails closed: an error or any non-true answer
 * is "not a manager".
 */
export async function callerIsShowManager(client: RoleScopedGuideClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_show_manager');
  return !error && data === true;
}

export function scopeGuidesToRole(
  guides: AskQGuideAsset[],
  isShowManager: boolean
): AskQGuideAsset[] {
  if (isShowManager) return guides;
  return guides.filter(guide => !MANAGEMENT_GUIDE_IDS.has(guide.id));
}

/** The guides in play for a mode: none for rules and show-data, role-scoped for app help. */
export function getDocumentGuides(
  allGuides: AskQGuideAsset[],
  questionMode: AskQQuestionMode | null,
  isShowManager: boolean
): AskQGuideAsset[] {
  if (questionMode === 'rules' || questionMode === 'show-data') return [];
  return scopeGuidesToRole(allGuides, isShowManager);
}
