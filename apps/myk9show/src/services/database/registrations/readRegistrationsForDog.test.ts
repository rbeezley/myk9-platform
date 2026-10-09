import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replica, getRegistrationsByDog } = vi.hoisted(() => ({
  replica: { getRegistrationsForDog: vi.fn() },
  getRegistrationsByDog: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: replica,
}));
vi.mock('./reads', () => ({ getRegistrationsByDog }));

import { readRegistrationsForDog } from './readRegistrationsForDog';

const server = [
  { id: 'r1', organization: 'AKC', registration_number: 'A1', registered_name: 'Old' },
  { id: 'r2', organization: 'UKC', registration_number: 'U1', registered_name: 'Kept' },
];

describe('readRegistrationsForDog (MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRegistrationsByDog.mockResolvedValue({ data: server, error: null });
  });

  it('overlays a queued edit, appends a queued add, hides a mirror of a server row', async () => {
    replica.getRegistrationsForDog.mockResolvedValue([
      { id: 'r1', organization: 'AKC', registration_number: 'A1', registered_name: 'New' },
      { id: 'add', organization: 'ASCA', registration_number: 'S1' },
      { id: 'mirror', organization: 'UKC', registration_number: 'U1' },
    ]);
    const { data, error } = await readRegistrationsForDog('dog-1');
    expect(error).toBeNull();
    expect(data.map(row => [row.id, row.registered_name])).toEqual([
      ['r1', 'New'],
      ['r2', 'Kept'],
      ['add', undefined],
    ]);
  });

  it('never resurfaces a row the server no longer has (an online delete)', async () => {
    // The replica's synced copy of a deleted row is not "unsent", so the table
    // never returns it here; only the server read decides.
    replica.getRegistrationsForDog.mockResolvedValue([]);
    getRegistrationsByDog.mockResolvedValue({ data: [server[1]], error: null });
    expect((await readRegistrationsForDog('dog-1')).data.map(row => row.id)).toEqual(['r2']);
  });

  it('a failed read reports the error, never the unsent rows alone (review round 2)', async () => {
    const offline = new Error('offline');
    getRegistrationsByDog.mockResolvedValue({ data: [], error: offline });
    replica.getRegistrationsForDog.mockResolvedValue([{ id: 'add', organization: 'ASCA' }]);
    expect(await readRegistrationsForDog('dog-1')).toEqual({ data: [], error: offline });
  });
});
