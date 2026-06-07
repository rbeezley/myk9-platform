/** Pure selectors over a presence roster. Kept separate from components so the
 *  component files export only components (react-refresh/only-export-components). */

import type { ShowPresence } from './types';

/** Judges currently present on a specific class (ring). */
export function judgesOnClass(present: ShowPresence[], classId: string): ShowPresence[] {
  return present.filter(
    p =>
      p.role === 'judge' &&
      p.location.entityType === 'class' &&
      p.location.entityId === classId
  );
}

/** Anyone who is not an exhibitor counts as "staff" for presence visibility. */
export function isStaffRole(role: string): boolean {
  return role !== 'exhibitor';
}

/**
 * Privacy filter (plan §10 #2): staff see everyone; exhibitors see only staff
 * (plus themselves). Applied once, per viewer, in ShowPresenceProvider.
 */
export function filterPresenceForViewer(
  roster: ShowPresence[],
  viewerId: string | undefined,
  viewerRole: string
): ShowPresence[] {
  if (isStaffRole(viewerRole)) return roster;
  return roster.filter(p => isStaffRole(p.role) || p.userId === viewerId);
}
