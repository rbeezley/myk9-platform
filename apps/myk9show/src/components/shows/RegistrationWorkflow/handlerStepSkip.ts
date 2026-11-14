/**
 * MYK9-2020: whether Next on Classes may go straight past the Handlers step.
 *
 * The staff wizard has a Handlers step of its own, and every dog's entries are
 * already assigned to the dog's owner by `autoAssignHandlers`. When nothing on
 * that step would change, it costs the secretary a click on every form she
 * keys. It is skipped only when EVERY entry has a handler and that handler is
 * the dog's owner; any other assignment (or a missing one) keeps the step.
 * The step stays in the rail and is reached with Back from Payment.
 */

import { makeHandlerKey } from '@/types/show-registration-types';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import type { StepId } from './RegistrationWorkflow.types';

export interface HandlerStepSkipInput {
  steps: readonly StepId[];
  currentStepId: StepId | undefined;
  classSelections: readonly ClassSelectionData[];
  handlerAssignments: Readonly<Record<string, HandlerInfo>>;
}

/** Every entry is handled by its dog's owner. False for an entry with no classes. */
export function everyEntryHandledByOwner(
  classSelections: readonly ClassSelectionData[],
  handlerAssignments: Readonly<Record<string, HandlerInfo>>
): boolean {
  const keys = classSelections.flatMap(selection =>
    selection.selectedClasses.map(cls => makeHandlerKey(selection.dogId, cls.classId))
  );
  return keys.length > 0 && keys.every(key => handlerAssignments[key]?.isOwner === true);
}

export function canSkipHandlerStep({
  steps,
  currentStepId,
  classSelections,
  handlerAssignments,
}: HandlerStepSkipInput): boolean {
  if (currentStepId !== 'class-selection') return false;
  const next = steps[steps.indexOf(currentStepId) + 1];
  if (next !== 'handler-assignment') return false;
  return everyEntryHandledByOwner(classSelections, handlerAssignments);
}
