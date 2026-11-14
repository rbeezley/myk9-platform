import { describe, expect, it } from 'vitest';
import { everyEntryHandledByOwner, wizardStepStride } from './ownerHandledEntries';
import { WORKFLOW_CONFIGS } from './RegistrationWorkflow.constants';

const selections = [
  { dogId: 'dog-1', selectedClasses: [{ classId: 'c1' }, { classId: 'c2' }] },
] as Parameters<typeof everyEntryHandledByOwner>[0];

const owner = { handlerId: 'p-1', handlerName: 'Pat Owner', isOwner: true };
const other = { handlerId: 'p-2', handlerName: 'Sam Handler', isOwner: false };

describe('everyEntryHandledByOwner (MYK9-2020)', () => {
  it('is true when every class is handled by the owner', () => {
    expect(everyEntryHandledByOwner(selections, { 'dog-1|c1': owner, 'dog-1|c2': owner })).toBe(
      true
    );
  });

  it('is false when one class has another handler or none', () => {
    expect(everyEntryHandledByOwner(selections, { 'dog-1|c1': owner, 'dog-1|c2': other })).toBe(
      false
    );
    expect(everyEntryHandledByOwner(selections, { 'dog-1|c1': owner })).toBe(false);
  });

  it('is false for an entry with no classes yet', () => {
    expect(everyEntryHandledByOwner([], {})).toBe(false);
  });
});

describe('wizardStepStride (MYK9-2020)', () => {
  const staffSteps = WORKFLOW_CONFIGS.secretary_new.steps;
  const classStep = staffSteps.indexOf('class-selection');
  const paymentStep = staffSteps.indexOf('payment');

  it('steps over Handlers from Classes, and back over it from Payment, when owners handle all', () => {
    expect(wizardStepStride(staffSteps, classStep, 1, true)).toBe(2);
    expect(wizardStepStride(staffSteps, paymentStep, -1, true)).toBe(2);
  });

  it('stops on Handlers when a dog has another handler', () => {
    expect(wizardStepStride(staffSteps, classStep, 1, false)).toBe(1);
    expect(wizardStepStride(staffSteps, paymentStep, -1, false)).toBe(1);
  });

  it('moves one step everywhere else', () => {
    expect(wizardStepStride(staffSteps, staffSteps.indexOf('dog-selection'), 1, true)).toBe(1);
    expect(wizardStepStride(staffSteps, staffSteps.indexOf('handler-assignment'), 1, true)).toBe(1);
    expect(wizardStepStride(staffSteps, staffSteps.indexOf('handler-assignment'), -1, true)).toBe(
      1
    );
  });

  it('leaves the exhibitor wizard, which has no Handlers step, one step at a time', () => {
    const exhibitorSteps = WORKFLOW_CONFIGS.exhibitor.steps;
    exhibitorSteps.forEach((_, index) => {
      expect(wizardStepStride(exhibitorSteps, index, 1, true)).toBe(1);
      expect(wizardStepStride(exhibitorSteps, index, -1, true)).toBe(1);
    });
  });
});
