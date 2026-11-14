import { describe, expect, it } from 'vitest';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import type { StepId } from './RegistrationWorkflow.types';
import { canSkipHandlerStep, everyEntryHandledByOwner } from './handlerStepSkip';

const STAFF_STEPS: StepId[] = [
  'dog-selection',
  'class-selection',
  'handler-assignment',
  'payment',
  'confirmation',
];

const selections = [
  { dogId: 'd1', selectedClasses: [{ classId: 'c1' }, { classId: 'c2' }] },
] as unknown as ClassSelectionData[];

const owner: HandlerInfo = { handlerId: 'p1', handlerName: 'Pat Owner', isOwner: true };
const other: HandlerInfo = { handlerId: 'p2', handlerName: 'Sam Handler', isOwner: false };

describe('canSkipHandlerStep (MYK9-2020)', () => {
  it('skips Handlers when every entry is handled by its owner', () => {
    expect(
      canSkipHandlerStep({
        steps: STAFF_STEPS,
        currentStepId: 'class-selection',
        classSelections: selections,
        handlerAssignments: { 'd1|c1': owner, 'd1|c2': owner },
      })
    ).toBe(true);
  });

  it('keeps Handlers when one entry has another handler', () => {
    expect(
      canSkipHandlerStep({
        steps: STAFF_STEPS,
        currentStepId: 'class-selection',
        classSelections: selections,
        handlerAssignments: { 'd1|c1': owner, 'd1|c2': other },
      })
    ).toBe(false);
  });

  it('keeps Handlers when an entry has no handler yet (a dog with no owner on file)', () => {
    expect(
      canSkipHandlerStep({
        steps: STAFF_STEPS,
        currentStepId: 'class-selection',
        classSelections: selections,
        handlerAssignments: { 'd1|c1': owner },
      })
    ).toBe(false);
  });

  it('only acts on Next from Classes', () => {
    expect(
      canSkipHandlerStep({
        steps: STAFF_STEPS,
        currentStepId: 'dog-selection',
        classSelections: selections,
        handlerAssignments: { 'd1|c1': owner, 'd1|c2': owner },
      })
    ).toBe(false);
  });

  it('does nothing in a wizard with no Handlers step (the exhibitor wizard)', () => {
    expect(
      canSkipHandlerStep({
        steps: ['dog-selection', 'class-selection', 'payment', 'confirmation'],
        currentStepId: 'class-selection',
        classSelections: selections,
        handlerAssignments: { 'd1|c1': owner, 'd1|c2': owner },
      })
    ).toBe(false);
  });
});

describe('everyEntryHandledByOwner', () => {
  it('is false for an entry with no classes', () => {
    expect(everyEntryHandledByOwner([], {})).toBe(false);
  });
});
