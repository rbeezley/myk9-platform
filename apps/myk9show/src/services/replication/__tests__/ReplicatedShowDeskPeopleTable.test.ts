import { describe, expect, it, vi } from 'vitest';
import { ReplicatedShowDeskPeopleTable } from '../ReplicatedShowDeskPeopleTable';

vi.mock('@myk9/core', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ReplicatedShowDeskPeopleTable', () => {
  it('stores a local pending person and queues a people insert with the supplied id', async () => {
    const table = new ReplicatedShowDeskPeopleTable();
    const setSpy = vi.spyOn(table, 'set').mockResolvedValue();
    const queueMutationSpy = vi
      .spyOn(
        table as unknown as {
          queueMutation: (
            operation: string,
            rowId: string,
            payload: Record<string, unknown>
          ) => Promise<string | null>;
        },
        'queueMutation'
      )
      .mockResolvedValue('person-mutation-1');

    const person = await table.createPerson({
      id: 'person-local-1',
      firstName: ' Jamie ',
      lastName: ' Walker ',
      email: ' jamie@example.com ',
      phone: ' 555-0100 ',
    });

    expect(person).toEqual(
      expect.objectContaining({
        id: 'person-local-1',
        firstName: 'Jamie',
        lastName: 'Walker',
        email: 'jamie@example.com',
        phone: '555-0100',
        status: 'active',
        _syncStatus: 'pending',
        _localOnly: true,
      })
    );
    expect(setSpy).toHaveBeenCalledWith('person-local-1', person, true);
    expect(queueMutationSpy).toHaveBeenCalledWith(
      'INSERT',
      'person-local-1',
      expect.objectContaining({
        id: 'person-local-1',
        first_name: 'Jamie',
        last_name: 'Walker',
        email: 'jamie@example.com',
        phone: '555-0100',
        status: 'active',
      })
    );
    expect(table.lastMutationId).toBe('person-mutation-1');
  });

  it('does not perform broad people-directory sync', async () => {
    const table = new ReplicatedShowDeskPeopleTable();

    await expect(table.sync()).resolves.toEqual(
      expect.objectContaining({
        tableName: 'people',
        success: true,
        rowsAffected: 0,
      })
    );
  });
});
