/**
 * Pure handler auto-assignment for the registration wizard.
 *
 * In workflows that don't have a dedicated handler-assignment step, every entry
 * (dog + class) defaults its handler to the dog's owner. This computes the next
 * assignment map from the current class selections, filling in only entries that
 * don't already have a handler so a user's manual override is never clobbered.
 *
 * INTENT: returns the SAME `prev` reference when nothing changed, so the caller's
 * `setHandlerAssignments(prev => ...)` can no-op and avoid a needless re-render.
 */

import { makeHandlerKey } from '@/types/show-registration-types';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import type { Dog } from '@/types/dog-types';

export type HandlerCandidateDog = Pick<Dog, 'id' | 'ownerId' | 'ownerName'>;

export function autoAssignHandlers(
  prev: Record<string, HandlerInfo>,
  classSelections: ClassSelectionData[],
  dogs: HandlerCandidateDog[]
): Record<string, HandlerInfo> {
  const newAssignments = { ...prev };
  let hasNewAssignments = false;

  classSelections.forEach(selection => {
    const dog = dogs.find(d => d.id === selection.dogId);
    if (!dog || !dog.ownerId) return;

    selection.selectedClasses.forEach(cls => {
      const key = makeHandlerKey(selection.dogId, cls.classId);
      if (!newAssignments[key]) {
        newAssignments[key] = {
          handlerId: dog.ownerId!,
          handlerName: dog.ownerName || 'Owner',
          isOwner: true,
        };
        hasNewAssignments = true;
      }
    });
  });

  return hasNewAssignments ? newAssignments : prev;
}
