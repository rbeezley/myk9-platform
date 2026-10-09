import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replica, getRegistrationsByDog } = vi.hoisted(() => ({
  replica: { isCold: vi.fn(), getRegistrationsForDogsPartitioned: vi.fn() },
  getRegistrationsByDog: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: replica,
}));
vi.mock('./reads', () => ({ getRegistrationsByDog }));

import { readRegistrationsForDog } from './replicaFirstReads';

describe('readRegistrationsForDog (MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRegistrationsByDog.mockResolvedValue({ data: [{ id: 'server' }], error: null });
  });

  it('a warm replica answers, newest registration date first (NULLs first like PostgREST)', async () => {
    replica.isCold.mockResolvedValue(false);
    replica.getRegistrationsForDogsPartitioned.mockResolvedValue({
      synced: [
        {
          id: 'old',
          registration_date: '2019-01-01',
          organization: 'AKC',
          registration_number: 'A1',
        },
        {
          id: 'new',
          registration_date: '2024-01-01',
          organization: 'UKC',
          registration_number: 'U1',
        },
      ],
      local: [
        // A pending add: shown.
        { id: 'none', registration_date: null, organization: 'ASCA', registration_number: 'S1' },
        // A local mirror of a row the server already holds under its own id: hidden.
        { id: 'mirror', registration_date: null, organization: 'AKC', registration_number: 'A1' },
      ],
    });
    const { data, error } = await readRegistrationsForDog('dog-1');
    expect(error).toBeNull();
    expect(data.map(row => row.id)).toEqual(['none', 'new', 'old']);
    expect(getRegistrationsByDog).not.toHaveBeenCalled();
  });

  it('a cold replica reads the server', async () => {
    replica.isCold.mockResolvedValue(true);
    expect((await readRegistrationsForDog('dog-1')).data).toEqual([{ id: 'server' }]);
  });
});
