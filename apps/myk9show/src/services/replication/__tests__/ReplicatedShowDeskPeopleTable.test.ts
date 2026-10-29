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
    const setSpy = vi
      .spyOn(table as unknown as { setWithRevision: () => Promise<unknown> }, 'setWithRevision')
      .mockResolvedValue({ result: { written: true }, revision: 2 });
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
      address: ' 12 Ring Road ',
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
    expect(setSpy).toHaveBeenCalledWith(
      'person-local-1',
      person,
      true,
      undefined,
      undefined,
      undefined
    );
    expect(queueMutationSpy).toHaveBeenCalledWith(
      'INSERT',
      'person-local-1',
      expect.objectContaining({
        id: 'person-local-1',
        first_name: 'Jamie',
        last_name: 'Walker',
        email: 'jamie@example.com',
        phone: '555-0100',
        street_address: '12 Ring Road',
        status: 'active',
      }),
      undefined,
      undefined,
      true
    );
    expect(table.lastMutationId).toBe('person-mutation-1');
  });

  it('offline, still stores and queues a new person (MYK9-1090: only edits need a connection)', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const table = new ReplicatedShowDeskPeopleTable();
    vi.spyOn(
      table as unknown as { setWithRevision: () => Promise<unknown> },
      'setWithRevision'
    ).mockResolvedValue({ result: { written: true }, revision: 2 });
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
      .mockResolvedValue('person-mutation-2');

    try {
      const person = await table.createPerson({
        id: 'person-offline-1',
        firstName: 'Jamie',
        lastName: 'Walker',
      });

      expect(person).toEqual(
        expect.objectContaining({ id: 'person-offline-1', _syncStatus: 'pending' })
      );
      expect(queueMutationSpy).toHaveBeenCalledWith(
        'INSERT',
        'person-offline-1',
        expect.objectContaining({ id: 'person-offline-1', first_name: 'Jamie' }),
        undefined,
        undefined,
        true
      );
    } finally {
      vi.restoreAllMocks();
    }
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
