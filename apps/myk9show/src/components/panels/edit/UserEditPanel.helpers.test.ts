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
 * MYK9-570 / MYK9-664. The secretary's person editor SETS a handler's date of
 * birth and junior handler numbers but never reads them back: the form always
 * starts blank, and only what was typed is sent, as a merge patch.
 */
describe('junior handler fields are write-only', () => {
  const user: Partial<UserType> = {
    id: 'person-1',
    firstName: 'Mariana',
    lastName: 'Rivera',
    email: 'mariana@example.com',
    roles: [],
    // Even when a caller hands the panel stored values, they are not shown.
    dateOfBirth: '2011-03-04',
    juniorHandlerNumbers: { AKC: '7654321', UKC: 'UKC-42' },
  };

  it('starts blank whatever the source carried', () => {
    const form = userToFormData(user);
    expect(form.dateOfBirth).toBe('');
    expect(form.juniorHandlerNumbers).toEqual({});
  });

  it('starts blank from a raw snake_case row too', () => {
    const form = userToFormData({
      id: 'person-2',
      date_of_birth: '2012-01-02',
      junior_handler_numbers: { AKC: '111' },
    } as unknown as Parameters<typeof userToFormData>[0]);
    expect(form.dateOfBirth).toBe('');
    expect(form.juniorHandlerNumbers).toEqual({});
  });

  it('an untouched form sends neither field, so it cannot clear what is stored', () => {
    const back = formDataToUser(userToFormData(user));
    expect('dateOfBirth' in back).toBe(false);
    expect('juniorHandlerNumbers' in back).toBe(false);
  });

  it('sends what was typed, trimmed, and only the registries that were filled', () => {
    const back = formDataToUser({
      ...userToFormData(user),
      dateOfBirth: '2011-03-04',
      juniorHandlerNumbers: { AKC: ' 7654321 ', UKC: '   ' },
    });
    expect(back.dateOfBirth).toBe('2011-03-04');
    // UKC is blank, so it is absent from the patch: the stored UKC number stays.
    expect(back.juniorHandlerNumbers).toEqual({ AKC: '7654321' });
  });

  it('rejects a future date of birth and accepts a blank one', () => {
    const base = userToFormData(user);
    expect(userFormSchema.safeParse({ ...base, dateOfBirth: '2999-01-01' }).success).toBe(false);
    expect(userFormSchema.safeParse({ ...base, dateOfBirth: '' }).success).toBe(true);
    expect(userFormSchema.safeParse({ ...base, dateOfBirth: '04/03/2011' }).success).toBe(false);
  });
});
