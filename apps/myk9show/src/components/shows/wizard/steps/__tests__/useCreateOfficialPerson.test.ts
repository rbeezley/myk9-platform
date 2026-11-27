import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const harness = vi.hoisted(() => ({
  state: {
    people: [] as Array<Record<string, string>>,
    loadPeople: vi.fn(),
  },
  createUser: vi.fn(async (_input: Record<string, string>) => ({
    data: { id: 'created-1' },
    error: null,
  })),
  updateUser: vi.fn(async () => ({ data: null, error: null })),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: typeof harness.state) => unknown) => selector(harness.state),
}));
vi.mock('@/services/database/users', () => ({
  createUser: harness.createUser,
  updateUser: harness.updateUser,
}));

import { useCreateOfficialPerson, OfficialAlreadyHoldsRoleError } from '../useCreateOfficialPerson';

const FORM = {
  firstName: 'Priya',
  lastName: 'Raman',
  email: 'p@example.com',
  phone: '(555) 010-2020',
};
const onFile = {
  id: 'person-9',
  firstName: 'Priya',
  lastName: 'Raman',
  email: 'p@example.com',
  phone: '',
};

describe('useCreateOfficialPerson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.state.people = [];
  });

  it('reuses the person on file with that email and saves the typed phone', async () => {
    harness.state.people = [onFile];
    const { result } = renderHook(() => useCreateOfficialPerson());

    await expect(result.current(FORM)).resolves.toBe('person-9');

    expect(harness.createUser).not.toHaveBeenCalled();
    expect(harness.updateUser).toHaveBeenCalledWith('person-9', { phone: '(555) 010-2020' });
  });

  it('creates the person with the phone when nobody on file has that email', async () => {
    harness.state.people = [{ id: 'x', email: 'other@example.com', phone: '' }];
    const { result } = renderHook(() => useCreateOfficialPerson());

    await expect(result.current(FORM)).resolves.toBe('created-1');
    expect(harness.createUser).toHaveBeenCalledWith({
      first_name: 'Priya',
      last_name: 'Raman',
      email: 'p@example.com',
      phone: '(555) 010-2020',
    });
  });

  it('refuses a matched person who holds the other role, before saving anything', async () => {
    harness.state.people = [
      { id: 'chair-1', firstName: 'Priya', lastName: 'Raman', email: 'p@example.com', phone: '' },
    ];
    const { result } = renderHook(() => useCreateOfficialPerson());

    await expect(result.current(FORM, { excludePersonIds: ['chair-1'] })).rejects.toBeInstanceOf(
      OfficialAlreadyHoldsRoleError
    );
    expect(harness.updateUser).not.toHaveBeenCalled();
    expect(harness.createUser).not.toHaveBeenCalled();
  });
});
