import type { MutationManager } from '@myk9/replication';
import { describe, expect, it, vi } from 'vitest';
import { ReplicatedDogsTable } from '../ReplicatedDogsTable';
import { ReplicatedEntriesTable } from '../ReplicatedEntriesTable';

function stubManager() {
  const register = vi.fn(() => () => undefined);
  const manager = {
    rowRefetchers: { register: () => () => undefined },
    discardReverters: { register },
  } as unknown as MutationManager;
  return { manager, register };
}

describe('Discard revert opt-in (MYK9-1076)', () => {
  it('dogs put a row back when its refused edit is discarded', () => {
    const { manager, register } = stubManager();

    new ReplicatedDogsTable().setMutationManager(manager);

    expect(register).toHaveBeenCalledWith('dogs', {
      onChanged: expect.any(Function),
      // Online, Discard also re-fetches the dog from the server.
      fetchRow: expect.any(Function),
    });
  });

  it('entries put a row back when a refused score, check-in or in-ring write is discarded (MYK9-1922)', () => {
    const { manager, register } = stubManager();

    new ReplicatedEntriesTable().setMutationManager(manager);

    expect(register).toHaveBeenCalledWith('entries', {
      onChanged: expect.any(Function),
      fetchRow: expect.any(Function),
    });
  });
});
