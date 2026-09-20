import { describe, expect, it } from 'vitest';
import { privateFieldsForCreate } from '@/store/userStore';

describe('privateFieldsForCreate', () => {
  it('keeps private fields out of the broad people insert payload', () => {
    expect(
      privateFieldsForCreate({
        dateOfBirth: '2012-04-02',
        juniorHandlerNumbers: { AKC: '664-JR' },
      })
    ).toEqual({
      date_of_birth: '2012-04-02',
      junior_handler_numbers: { AKC: '664-JR' },
    });
  });

  it('preserves explicit empty values so a create cannot silently discard them', () => {
    expect(privateFieldsForCreate({ dateOfBirth: '', juniorHandlerNumbers: {} })).toEqual({
      date_of_birth: null,
      junior_handler_numbers: {},
    });
  });
});
