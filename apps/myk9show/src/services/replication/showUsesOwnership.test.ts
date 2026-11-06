import { describe, expect, it, vi } from 'vitest';
import type { MutationManager, PendingMutation, ReplicatedTable } from '@myk9/replication';
import { holdOwnedSwitches, pendingUsesFields } from './showUsesOwnership';

type Show = { id: string; name: string; usesPaperPacket: boolean };
type Params = Parameters<ReplicatedTable<Show>['reconcileDirtyRow']>[1];

const local: Show = { id: 'show-1', name: 'Local', usesPaperPacket: true };
const remote: Show = { id: 'show-1', name: 'Server', usesPaperPacket: false };
const params = { remote } as unknown as Params;

function fakeTable() {
  return {
    getTableName: () => 'shows',
    getReplicatedRow: vi.fn(async () => ({ data: local })),
  } as unknown as ReplicatedTable<Show>;
}

function manager(read: () => Promise<PendingMutation[]>) {
  return { getPendingMutationsForRow: vi.fn(read) } as unknown as MutationManager;
}

const paperWrite = {
  operation: 'UPDATE',
  data: { uses_paper_packet: true },
  explicitDataKeys: ['uses_paper_packet'],
} as unknown as PendingMutation;

describe('showUsesOwnership (MYK9-1721)', () => {
  it('claims only the uses_* columns a queued write sets', () => {
    const rename = {
      operation: 'UPDATE',
      data: { name: 'X' },
      explicitDataKeys: ['name'],
    } as unknown as PendingMutation;
    expect(pendingUsesFields([rename])).toEqual([]);
    expect(pendingUsesFields([rename, paperWrite])).toEqual(['usesPaperPacket']);
  });

  it('holds an owned switch at the device value and keeps the server for everything else', async () => {
    const held = await holdOwnedSwitches(
      fakeTable(),
      manager(async () => [paperWrite]),
      'show-1',
      params
    );
    expect(held.remote).toEqual({ id: 'show-1', name: 'Server', usesPaperPacket: true });
  });

  // The pending read needs a signed-in identity; a token-refresh gap must not fail the sync.
  it('owns nothing, and leaves the server copy as is, when the pending read throws', async () => {
    const held = await holdOwnedSwitches(
      fakeTable(),
      manager(async () => {
        throw new Error('Cannot operate without an authenticated user identity');
      }),
      'show-1',
      params
    );
    expect(held.remote).toBe(remote);
  });
});
