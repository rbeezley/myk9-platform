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

  it('entries keep the existing Discard behaviour', () => {
    const { manager, register } = stubManager();

    new ReplicatedEntriesTable().setMutationManager(manager);

    expect(register).not.toHaveBeenCalled();
  });
});
