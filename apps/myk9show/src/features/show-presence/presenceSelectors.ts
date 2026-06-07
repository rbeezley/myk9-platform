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
