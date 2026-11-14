import { makeHandlerKey } from '@/types/show-registration-types';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import type { StepId } from './RegistrationWorkflow.types';

/**
 * MYK9-2020: true when the entry has at least one class and every one of them
 * is handled by the dog's owner (the default the wizard fills in). Then the
 * secretary's Handlers step has nothing to ask, and Next steps over it.
 */
export function everyEntryHandledByOwner(
  classSelections: readonly ClassSelectionData[],
  handlerAssignments: Readonly<Record<string, HandlerInfo>>
): boolean {
  const keys = classSelections.flatMap(selection =>
    selection.selectedClasses.map(cls => makeHandlerKey(selection.dogId, cls.classId))
  );
  return (
    keys.length > 0 &&
    keys.every(key => {
      const handler = handlerAssignments[key];
      return handler?.isOwner === true && !!handler.handlerName;
    })
  );
}

/**
 * How many steps Next (+1) or Back (-1) moves. Two when it would land on the
 * Handlers step between Classes and Payment and every dog is handled by its
 * owner; one otherwise. The Handlers step stays in the rail, so the secretary
 * can still open it to change a handler.
 */
export function wizardStepStride(
  steps: readonly StepId[],
  currentIndex: number,
  direction: 1 | -1,
  ownersHandleEveryEntry: boolean
): 1 | 2 {
  if (!ownersHandleEveryEntry) return 1;
  const from = steps[currentIndex];
  const over = steps[currentIndex + direction];
  const to = steps[currentIndex + 2 * direction];
  if (over !== 'handler-assignment') return 1;
  const skips =
    direction === 1
      ? from === 'class-selection' && to === 'payment'
      : from === 'payment' && to === 'class-selection';
  return skips ? 2 : 1;
}
