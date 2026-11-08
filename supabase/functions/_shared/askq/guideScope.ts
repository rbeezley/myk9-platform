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
  rpc(
    name: 'is_show_manager' | 'is_show_secretary',
    args?: { check_show_id: string }
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Runs as the caller (user-JWT client). `is_show_manager()` is true for site
 * admins and for club-scoped secretaries and club admins (the helper the
 * dogs/people RLS uses). A secretary appointed to a single show has a
 * show-scoped role row that `is_show_manager()` does not see, so when a
 * verified show is open `is_show_secretary(show)` is asked too. Fails closed:
 * an error or any non-true answer is "not a manager".
 */
export async function callerIsShowManager(
  client: RoleScopedGuideClient,
  verifiedShowId?: string | null
): Promise<boolean> {
  const manager = await client.rpc('is_show_manager');
  if (!manager.error && manager.data === true) return true;
  if (!verifiedShowId) return false;
  const secretary = await client.rpc('is_show_secretary', { check_show_id: verifiedShowId });
  return !secretary.error && secretary.data === true;
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
