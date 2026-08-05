import { describe, expect, it } from 'vitest';
import { formDataToUser, userToFormData } from './UserEditPanel.helpers';

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
