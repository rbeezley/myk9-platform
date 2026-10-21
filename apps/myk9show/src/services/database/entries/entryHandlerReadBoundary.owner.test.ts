// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';

const loadHandlerPeople = vi.hoisted(() => vi.fn());
vi.mock('./handlerHydration', () => ({ loadHandlerPeople }));

import { mapReplicatedEntriesWithHandlerIdentity } from './entryHandlerReadBoundary';

const dog = { id: 'dog-1', name: 'Cooper', callName: 'Cooper', ownerId: 'person-1' };
const entry = { id: 'entry-1', dogId: 'dog-1', dogOwnerId: 'person-1' } as ReplicatedEntry;

function run() {
  const dogsMap = new Map([['dog-1', dog as unknown as ReplicatedDog]]);
  return mapReplicatedEntriesWithHandlerIdentity([entry], dogsMap, e =>
    mapReplicatedEntryToDbRow(e, { dog: dogsMap.get('dog-1') ?? null })
  );
}

// MYK9-1320: a replicated dog row carries only owner_id, so the mapper emits the owner with null
// names. Every replication-path reader (the trial Financials card, among them) showed a blank
// owner until the people join filled it in.
describe('replicated entry reads: owner names', () => {
  beforeEach(() => {
    loadHandlerPeople.mockReset();
  });

  it('fills the dog owner names from the people the read already hydrated', async () => {
    loadHandlerPeople.mockResolvedValue(
      new Map([['person-1', { id: 'person-1', first_name: 'Jordan', last_name: 'Ellis' }]])
    );

    const [row] = await run();

    // The read asks for the owner's person row, so the names come from the real hydration path.
    expect(loadHandlerPeople).toHaveBeenCalledWith(expect.arrayContaining(['person-1']));
    expect((row?.dog as { owner: unknown }).owner).toMatchObject({
      id: 'person-1',
      first_name: 'Jordan',
      last_name: 'Ellis',
    });
  });

  it('leaves the owner names null, not invented, when the person is not available yet', async () => {
    loadHandlerPeople.mockResolvedValue(new Map());

    const [row] = await run();

    expect((row?.dog as { owner: unknown }).owner).toMatchObject({
      id: 'person-1',
      first_name: null,
      last_name: null,
    });
  });
});
