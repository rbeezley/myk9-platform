import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const harness = vi.hoisted(() => ({
  state: {
    people: [] as Array<Record<string, string>>,
    directoryIncomplete: false,
    loadPeople: vi.fn(),
  },
  createUser: vi.fn(async () => ({ data: { id: 'created-1' }, error: null })),
  updateUser: vi.fn(async () => ({ data: null, error: null })),
  fetchServerPersonMatches: vi.fn(),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: typeof harness.state) => unknown) => selector(harness.state),
}));
vi.mock('@/services/database/users', () => ({
  createUser: harness.createUser,
  updateUser: harness.updateUser,
}));
vi.mock('@/components/shows/RegistrationWorkflow/useServerPersonMatches', () => ({
  fetchServerPersonMatches: harness.fetchServerPersonMatches,
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
    harness.state.directoryIncomplete = false;
    harness.fetchServerPersonMatches.mockResolvedValue({ people: [], failed: false });
  });

  it('asks the server for the email when the saved directory is empty, and reuses the match', async () => {
    harness.fetchServerPersonMatches.mockResolvedValue({ people: [onFile], failed: false });
    const { result } = renderHook(() => useCreateOfficialPerson());

    await expect(result.current(FORM)).resolves.toBe('person-9');

    expect(harness.createUser).not.toHaveBeenCalled();
    expect(harness.updateUser).toHaveBeenCalledWith('person-9', { phone: '(555) 010-2020' });
  });

  it('asks the server when the directory is flagged incomplete even with people loaded', async () => {
    harness.state.people = [{ id: 'x', email: 'other@example.com', phone: '' }];
    harness.state.directoryIncomplete = true;
    harness.fetchServerPersonMatches.mockResolvedValue({ people: [onFile], failed: false });
    const { result } = renderHook(() => useCreateOfficialPerson());

    await expect(result.current(FORM)).resolves.toBe('person-9');
    expect(harness.createUser).not.toHaveBeenCalled();
  });

  it('does not ask the server when the saved directory is complete and has no match', async () => {
    harness.state.people = [{ id: 'x', email: 'other@example.com', phone: '' }];
    const { result } = renderHook(() => useCreateOfficialPerson());

    await expect(result.current(FORM)).resolves.toBe('created-1');
    expect(harness.fetchServerPersonMatches).not.toHaveBeenCalled();
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
