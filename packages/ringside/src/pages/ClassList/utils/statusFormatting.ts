/** Contextual class-list preview text. Status icon, color, and label presentation lives in @myk9/ui. */

import type { ClassEntry } from '../types';
import { getClassDisplayStatus } from '../../../utils/classStatus';

/**
 * Build operational preview text for a class card. This describes counts and
 * running order context; it does not own the class status badge grammar.
 */
export function getContextualPreview(classEntry: ClassEntry): string {
  const status = getClassDisplayStatus(classEntry);

  switch (status) {
    case 'not-started':
      return `${classEntry.entry_count} ${classEntry.entry_count === 1 ? 'entry' : 'entries'} • Not yet started`;

    case 'completed':
      return `Completed • ${classEntry.entry_count} ${classEntry.entry_count === 1 ? 'entry' : 'entries'} scored`;

    case 'in-progress': {
      const inRingDog = classEntry.dogs.find(dog => dog.in_ring);
      const nextDogs = classEntry.dogs
        .filter(
          dog =>
            !dog.is_scored &&
            !dog.in_ring &&
            dog.checkin_status !== 3
        )
        .slice(0, 3);

      let preview = '';
      if (inRingDog) {
        preview += `In Ring: ${inRingDog.armband} (${inRingDog.call_name})`;
      }

      if (nextDogs.length > 0) {
        const nextArmband = nextDogs.map(dog => dog.armband).join(', ');
        preview += inRingDog ? ` • Next: ${nextArmband}` : `Next: ${nextArmband}`;
      }

      const remaining = classEntry.entry_count - classEntry.completed_count;
      if (preview) {
        preview += `\n${remaining} of ${classEntry.entry_count} remaining`;
      } else {
        preview = `${remaining} of ${classEntry.entry_count} remaining`;
      }

      return preview;
    }
    default:
      return `${classEntry.completed_count} of ${classEntry.entry_count} entries scored`;
  }
}
