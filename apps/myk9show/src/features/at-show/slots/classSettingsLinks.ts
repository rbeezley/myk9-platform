/**
 * Where ringside Class Settings sends a person: the secretary controls that already exist,
 * never a copy of them (MYK9-1627).
 *
 * Both targets are manager-only pages (`ShowManagementSectionRoute` / the show home), so a link
 * shows only to someone `useShowManageScope` admits there. A judge who may manage classes at
 * the ring but not the show sees neither link, and then no Settings tile at all.
 */
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { SHOW_DESK_TOOL_PARAM } from '@/features/actions/showToolActions';

const SELF_CHECKIN_TOOL_ID = 'self-checkin';

/** `tool` is read by ShowDeskToolPanel; `focus` by the cockpit schedule, which focuses the class. */
export function getClassCheckinModeHref(showId: string, classId: string): string {
  const params = new URLSearchParams({
    [SHOW_DESK_TOOL_PARAM]: SELF_CHECKIN_TOOL_ID,
    focus: classId,
  });
  return `/shows/${encodeURIComponent(showId)}?${params.toString()}`;
}

/** `classId` is read by the Results list (selects the class); `visibility` by ResultsTab (opens the sheet). */
export function getClassResultsVisibilityHref(showId: string, classId: string): string {
  const params = new URLSearchParams({ classId, visibility: '1' });
  return `/shows/${encodeURIComponent(showId)}/results?${params.toString()}`;
}

/** True when at least one Settings link would show; the tile stays hidden otherwise. */
export function useHasClassSettingsLinks(showId: string | undefined): boolean {
  const scope = useShowManageScope(showId);
  return !!showId && scope.status === 'resolved' && scope.canManage;
}
