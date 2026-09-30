import { describe, it, expect } from 'vitest';
import { addDogSchema } from './validation';
import { createInitialFormData } from './types';
import { locateInvalidField } from './validationTab';

describe('locateInvalidField (MYK9-885)', () => {
  it('sends the required Essential fields to the Essential tab', () => {
    expect(locateInvalidField('callName')).toEqual({ tab: 'basic', elementId: 'callName' });
    expect(locateInvalidField('gender')).toEqual({ tab: 'basic', elementId: 'gender' });
    expect(locateInvalidField('dateOfBirth')).toEqual({ tab: 'basic', elementId: 'dateOfBirth' });
  });

  it('sends optional-detail fields to the Optional tab and registrations to Registration', () => {
    expect(locateInvalidField('microchip')?.tab).toBe('optional');
    expect(locateInvalidField('registrations')?.tab).toBe('registration');
  });

  it('returns undefined for an unknown field', () => {
    expect(locateInvalidField('nope')).toBeUndefined();
  });

  it('covers every field the schema can fail on', () => {
    const fields = Object.keys(addDogSchema.shape);
    for (const field of fields) {
      expect(locateInvalidField(field), field).toBeDefined();
    }
    expect(fields).toEqual(expect.arrayContaining(Object.keys(createInitialFormData())));
  });
});
