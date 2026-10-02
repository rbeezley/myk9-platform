/**
 * The one class-detail URL (MYK9-929, H13). Every list that shows a class row opens this, so
 * Back, the breadcrumb and a shared link all agree. `/classes/:classId` still exists as a
 * redirect for old links and notifications; no list navigates to it.
 */
export function getClassDetailHref(showId: string, trialId: string, classId: string): string {
  return `/shows/${showId}/trials/${trialId}/classes/${classId}`;
}
