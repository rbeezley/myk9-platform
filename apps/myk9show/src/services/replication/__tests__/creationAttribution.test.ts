/**
 * MYK9-1059 — the INSERT payloads a dog or person is queued with carry
 * `created_from_show_id` only when the add-entry flow supplied a show, and an
 * UPDATE never sends it. `created_by` is server-stamped and must never appear.
 */
import { describe, expect, it, vi } from 'vitest';
import { ReplicatedDogsTable, type ReplicatedDog } from '../ReplicatedDogsTable';
import { ReplicatedShowDeskPeopleTable } from '../ReplicatedShowDeskPeopleTable';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@myk9/core', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const SHOW_ID = '6349d047-34fe-4307-b29a-c1ae6d7750c7';

type QueueSpy = (
  operation: string,
  rowId: string,
  payload: Record<string, unknown>,
  dependencies?: string[],
  rpc?: { name: string; args: Record<string, unknown>; expectRowId: boolean }
) => Promise<string>;

function spyOnQueue(table: object) {
  vi.spyOn(table as { set: () => Promise<unknown> }, 'set').mockResolvedValue({ written: true });
  return vi
    .spyOn(table as unknown as { queueMutation: QueueSpy }, 'queueMutation')
    .mockResolvedValue('mutation-1');
}

const dog: ReplicatedDog = { id: 'dog-1', name: 'Liddle', callName: 'Liddle', breed: 'Mixed' };

describe('dog INSERT payloads (MYK9-1059)', () => {
  it('createDogWithId sends created_from_show_id when a show is given', async () => {
    const table = new ReplicatedDogsTable();
    const queue = spyOnQueue(table);
    await table.createDogWithId(dog, { createdFromShowId: SHOW_ID });
    expect(queue).toHaveBeenCalledWith(
      'INSERT',
      'dog-1',
      expect.objectContaining({ created_from_show_id: SHOW_ID }),
      undefined
    );
  });

  it('createDogWithId omits created_from_show_id and created_by outside the wizard', async () => {
    const table = new ReplicatedDogsTable();
    const queue = spyOnQueue(table);
    await table.createDogWithId(dog);
    const row = queue.mock.calls[0]![2];
    expect(row).not.toHaveProperty('created_from_show_id');
    expect(row).not.toHaveProperty('created_by');
  });

  it('createDogWithRegistrationsRpc puts created_from_show_id in p_dog', async () => {
    const table = new ReplicatedDogsTable();
    const queue = spyOnQueue(table);
    await table.createDogWithRegistrationsRpc(dog, [], { createdFromShowId: SHOW_ID });
    const rpc = queue.mock.calls[0]![4]!;
    expect(rpc.name).toBe('create_dog_with_registrations');
    expect(rpc.args['p_dog']).toEqual(expect.objectContaining({ created_from_show_id: SHOW_ID }));
  });

  it('createDogWithRegistrationsRpc omits it outside the wizard', async () => {
    const table = new ReplicatedDogsTable();
    const queue = spyOnQueue(table);
    await table.createDogWithRegistrationsRpc(dog, []);
    expect(queue.mock.calls[0]![4]!.args['p_dog']).not.toHaveProperty('created_from_show_id');
  });

  it('an UPDATE never sends created_from_show_id', async () => {
    const table = new ReplicatedDogsTable();
    const queue = spyOnQueue(table);
    vi.spyOn(table, 'get').mockResolvedValue(dog);
    await table.updateDog('dog-1', { color: 'Black' });
    expect(queue.mock.calls[0]![2]).not.toHaveProperty('created_from_show_id');
  });
});

describe('person INSERT payload (MYK9-1059)', () => {
  it('sends created_from_show_id when a show is given', async () => {
    const table = new ReplicatedShowDeskPeopleTable();
    const queue = spyOnQueue(table);
    await table.createPerson({ firstName: 'Ann', lastName: 'Lee', createdFromShowId: SHOW_ID });
    expect(queue).toHaveBeenCalledWith(
      'INSERT',
      expect.any(String),
      expect.objectContaining({ created_from_show_id: SHOW_ID })
    );
  });

  it('omits created_from_show_id and created_by when no show is given', async () => {
    const table = new ReplicatedShowDeskPeopleTable();
    const queue = spyOnQueue(table);
    await table.createPerson({ firstName: 'Ann', lastName: 'Lee' });
    const row = queue.mock.calls[0]![2];
    expect(row).not.toHaveProperty('created_from_show_id');
    expect(row).not.toHaveProperty('created_by');
  });
});
