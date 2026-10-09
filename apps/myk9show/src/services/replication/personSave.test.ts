import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replica, updateUser } = vi.hoisted(() => ({
  replica: { updatePerson: vi.fn(), getPersonById: vi.fn() },
  updateUser: vi.fn(),
}));

vi.mock('./ReplicatedShowDeskPeopleTable', () => ({ replicatedShowDeskPeopleTable: replica }));
vi.mock('@/services/database/users', () => ({ updateUser }));

import { savePersonDetails } from './personSave';
import type { ReplicatedShowDeskPerson } from './personRowMapping';
import {
  EMAIL_CHANGE_NEEDS_CONNECTION_CODE,
  PERSON_NOT_ON_DEVICE_CODE,
} from '@/utils/signInEmailMessages';

const row: ReplicatedShowDeskPerson = {
  id: 'p1',
  firstName: 'Pat',
  lastName: 'Owner',
  email: 'pat@example.test',
  authUserId: null,
  status: 'active',
};
const getRow = vi.fn();

describe('savePersonDetails (MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRow.mockResolvedValue(row);
    replica.updatePerson.mockResolvedValue('mutation-1');
    replica.getPersonById.mockResolvedValue(row);
    updateUser.mockResolvedValue({ data: { id: 'p1', email: 'new@example.test' }, error: null });
  });

  it('queues the people columns and the private patch; drops an unchanged email', async () => {
    const result = await savePersonDetails(
      'p1',
      {
        first_name: 'Patricia',
        email: '  PAT@example.test ',
        updated_at: '2026-01-01',
        date_of_birth: '',
        junior_handler_numbers: { AKC: 'J1' },
      },
      { getRow, isOnline: () => false }
    );

    expect(result.route).toBe('queued');
    expect(replica.updatePerson).toHaveBeenCalledWith(
      'p1',
      { first_name: 'Patricia' },
      { date_of_birth: null, junior_handler_numbers: { AKC: 'J1' } }
    );
    expect(result.person).toMatchObject({ id: 'p1', first_name: 'Patricia' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('sends an email change online through the guarded path', async () => {
    const result = await savePersonDetails(
      'p1',
      { first_name: 'Pat', email: 'new@example.test' },
      { getRow, isOnline: () => true }
    );
    expect(result.route).toBe('online');
    expect(updateUser).toHaveBeenCalledWith('p1', { first_name: 'Pat', email: 'new@example.test' });
    expect(replica.updatePerson).not.toHaveBeenCalled();
  });

  it('refuses an email change offline with a coded error and queues nothing', async () => {
    await expect(
      savePersonDetails('p1', { email: 'new@example.test' }, { getRow, isOnline: () => false })
    ).rejects.toMatchObject({ code: EMAIL_CHANGE_NEEDS_CONNECTION_CODE });
    expect(replica.updatePerson).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuses when the person is not on this device after the cold-replica sync', async () => {
    getRow.mockResolvedValue(null);
    await expect(
      savePersonDetails('p1', { city: 'Edison' }, { getRow, isOnline: () => false })
    ).rejects.toMatchObject({ code: PERSON_NOT_ON_DEVICE_CODE });
    expect(replica.updatePerson).not.toHaveBeenCalled();
  });

  it('keeps account status out of a profile save', async () => {
    await expect(
      savePersonDetails('p1', { status: 'suspended' }, { getRow, isOnline: () => true })
    ).rejects.toThrow(/status/);
  });
});
