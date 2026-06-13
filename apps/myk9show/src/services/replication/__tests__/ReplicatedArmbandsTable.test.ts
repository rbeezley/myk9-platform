import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedArmbandsTable, type ReplicatedArmband } from '../ReplicatedArmbandsTable';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@myk9/core', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ReplicatedArmbandsTable', () => {
  let table: ReplicatedArmbandsTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedArmbandsTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('queues a narrow update when assigning an existing show/dog armband row', async () => {
    const queueMutation = vi.spyOn(
      table as unknown as {
        queueMutation: (
          operation: string,
          rowId: string,
          payload: Record<string, unknown>,
          dependencies?: string[]
        ) => Promise<string | null>;
      },
      'queueMutation'
    );

    const existing: ReplicatedArmband = {
      id: 'armband-1',
      showId: 'show-1',
      dogId: 'dog-1',
      armbandNumber: '101',
      isAvailable: false,
      assignedAt: '2026-06-01T00:00:00.000Z',
    };
    await table.set(existing.id, existing);

    await table.upsertAssignedArmband({
      showId: 'show-1',
      dogId: 'dog-1',
      armbandNumber: '205',
    });

    expect(queueMutation).toHaveBeenCalledWith(
      'UPDATE',
      'armband-1',
      expect.objectContaining({
        id: 'armband-1',
        show_id: 'show-1',
        dog_id: 'dog-1',
        armband_number: '205',
        is_available: false,
        assigned_at: expect.any(String),
      })
    );
    expect(queueMutation.mock.calls[0]?.[2]).not.toHaveProperty('trial_id');

    const local = await table.get('armband-1');
    expect(local).toEqual(
      expect.objectContaining({
        id: 'armband-1',
        showId: 'show-1',
        dogId: 'dog-1',
        armbandNumber: '205',
        isAvailable: false,
        _syncStatus: 'pending',
      })
    );
  });

  it('rejects assigning an armband number already used by another dog in the show', async () => {
    const queueMutation = vi.spyOn(
      table as unknown as {
        queueMutation: (
          operation: string,
          rowId: string,
          payload: Record<string, unknown>,
          dependencies?: string[]
        ) => Promise<string | null>;
      },
      'queueMutation'
    );

    await table.set('armband-1', {
      id: 'armband-1',
      showId: 'show-1',
      dogId: 'dog-1',
      armbandNumber: '205',
      isAvailable: false,
    });

    await expect(
      table.upsertAssignedArmband({
        showId: 'show-1',
        dogId: 'dog-2',
        armbandNumber: '205',
      })
    ).rejects.toThrow('Armband 205 is already assigned to another dog in this show.');
    expect(queueMutation).not.toHaveBeenCalled();
  });
});
