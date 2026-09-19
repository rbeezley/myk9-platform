import { describe, expect, it } from 'vitest';
import { buildUpdatePersonPayload } from './useUsers';
import type { User } from '@/types/user-types';

const person = (fields: Partial<User> = {}): User =>
  ({ id: 'person-1', firstName: 'Ada', lastName: 'Handler', roles: [], ...fields }) as User;

describe('buildUpdatePersonPayload private field boundary', () => {
  it('omits private keys when a transient read left them undefined', () => {
    const payload = buildUpdatePersonPayload(person({ phone: '555-0100' }));

    expect(payload).not.toHaveProperty('date_of_birth');
    expect(payload).not.toHaveProperty('junior_handler_numbers');
    expect(payload.phone).toBe('555-0100');
  });

  it('keeps explicit private edits in the payload', () => {
    const payload = buildUpdatePersonPayload(
      person({ dateOfBirth: '2011-03-04', juniorHandlerNumbers: { AKC: '123' } })
    );

    expect(payload.date_of_birth).toBe('2011-03-04');
    expect(payload.junior_handler_numbers).toEqual({ AKC: '123' });
  });
});
