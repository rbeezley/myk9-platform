import { describe, expect, it } from 'vitest';
import type { User as UserType } from '@/types/user-types';
import { formDataToUser, userFormSchema, userToFormData } from './UserEditPanel.helpers';

const formData = userToFormData({
  id: 'person-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  status: 'suspended',
  roles: [],
});

describe('UserEditPanel account lifecycle boundary', () => {
  it('does not carry account status through profile form saves', () => {
    expect(formData).not.toHaveProperty('status');
    expect(formDataToUser(formData)).not.toHaveProperty('status');
  });
});

/**
 * MYK9-570. The secretary's person edit round-trips the date of birth and the
 * registry junior handler numbers. The numbers live in the form as one flat
 * input per registry and in the database as a keyed map, so the two converters
 * are where a value goes missing.
 */
describe('junior handler fields round-trip', () => {
  const user: Partial<UserType> = {
    id: 'person-1',
    firstName: 'Mariana',
    lastName: 'Rivera',
    email: 'mariana@example.com',
    roles: [],
    dateOfBirth: '2011-03-04',
    juniorHandlerNumbers: { AKC: '7654321', UKC: 'UKC-42' },
  };

  it('unpacks the keyed map into one input per registry', () => {
    const form = userToFormData(user);
    expect(form.dateOfBirth).toBe('2011-03-04');
    expect(form.juniorHandlerNumberAKC).toBe('7654321');
    expect(form.juniorHandlerNumberUKC).toBe('UKC-42');
  });

  it('reassembles them and survives a full round-trip unchanged', () => {
    const back = formDataToUser(userToFormData(user));
    expect(back.dateOfBirth).toBe('2011-03-04');
    expect(back.juniorHandlerNumbers).toEqual({ AKC: '7654321', UKC: 'UKC-42' });
  });

  it('omits a blank number instead of storing an empty string', () => {
    const form = userToFormData({ ...user, juniorHandlerNumbers: { AKC: '7654321' } });
    expect(formDataToUser(form).juniorHandlerNumbers).toEqual({ AKC: '7654321' });
  });

  it('reads a raw snake_case people row too', () => {
    const form = userToFormData({
      id: 'person-2',
      date_of_birth: '2012-01-02',
      junior_handler_numbers: { AKC: '111' },
    } as unknown as Parameters<typeof userToFormData>[0]);
    expect(form.dateOfBirth).toBe('2012-01-02');
    expect(form.juniorHandlerNumberAKC).toBe('111');
  });

  it('rejects a future date of birth and accepts a blank one', () => {
    const base = userToFormData(user);
    expect(userFormSchema.safeParse({ ...base, dateOfBirth: '2999-01-01' }).success).toBe(false);
    expect(userFormSchema.safeParse({ ...base, dateOfBirth: '' }).success).toBe(true);
    expect(userFormSchema.safeParse({ ...base, dateOfBirth: '04/03/2011' }).success).toBe(false);
  });
});
