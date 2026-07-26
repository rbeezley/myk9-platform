import { describe, expect, it, vi } from 'vitest';
import { ReplicatedDogRegistrationsTable } from '../ReplicatedDogRegistrationsTable';

vi.mock('@myk9/core', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ReplicatedDogRegistrationsTable', () => {
  it('queues dog registration inserts behind the dog mutation', async () => {
    const table = new ReplicatedDogRegistrationsTable();
    const setSpy = vi.spyOn(table, 'set').mockResolvedValue();
    const queueMutationSpy = vi
      .spyOn(
        table as unknown as {
          queueMutation: (
            operation: string,
            rowId: string,
            payload: Record<string, unknown>,
            dependsOn?: string[]
          ) => Promise<string | null>;
        },
        'queueMutation'
      )
      .mockResolvedValue('registration-mutation-1');

    const registrations = await table.createRegistrationsForDog(
      'dog-local-1',
      [
        {
          organization: 'AKC',
          number: 'SW123456',
          registeredName: 'Beacon Hill Fast Lane',
          type: 'Border Collie',
          status: 'pending',
        },
      ],
      { dependsOn: ['dog-mutation-1'] }
    );

    expect(registrations).toHaveLength(1);
    expect(setSpy).toHaveBeenCalledWith(
      registrations[0].id,
      expect.objectContaining({
        dogId: 'dog-local-1',
        organization: 'AKC',
        registrationNumber: 'SW123456',
        registeredName: 'Beacon Hill Fast Lane',
        createdAt: expect.any(String),
        _syncStatus: 'pending',
        _localOnly: true,
      }),
      true
    );
    expect(queueMutationSpy).toHaveBeenCalledWith(
      'INSERT',
      registrations[0].id,
      expect.objectContaining({
        id: registrations[0].id,
        dog_id: 'dog-local-1',
        organization: 'AKC',
        registration_number: 'SW123456',
        registered_name: 'Beacon Hill Fast Lane',
        breed: 'Border Collie',
        created_at: expect.any(String),
        status: 'pending',
      }),
      ['dog-mutation-1']
    );
  });

  it('can create local registration rows without queueing separate uploads', async () => {
    const table = new ReplicatedDogRegistrationsTable();
    const setSpy = vi.spyOn(table, 'set').mockResolvedValue();
    const queueMutationSpy = vi.spyOn(
      table as unknown as {
        queueMutation: (
          operation: string,
          rowId: string,
          payload: Record<string, unknown>,
          dependsOn?: string[]
        ) => Promise<string | null>;
      },
      'queueMutation'
    );

    const registrations = await table.createLocalRegistrationsForDog('dog-local-1', [
      {
        organization: 'AKC',
        number: 'SW123456',
        registeredName: 'Beacon Hill Fast Lane',
        type: 'Border Collie',
        status: 'pending',
      },
    ]);

    expect(registrations).toHaveLength(1);
    expect(setSpy).toHaveBeenCalledWith(
      registrations[0].id,
      expect.objectContaining({
        dogId: 'dog-local-1',
        registrationNumber: 'SW123456',
        createdAt: expect.any(String),
      }),
      false
    );
    expect(queueMutationSpy).not.toHaveBeenCalled();
  });
});
