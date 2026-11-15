import { describe, expect, it, vi } from 'vitest';
import type { PendingMutation } from '@myk9/replication';
import {
  keepMyChange,
  keepOtherChange,
  type ConflictChoiceQueue,
  type ConflictChoiceTable,
} from './conflictChoices';

/** MYK9-1993: what each answer to the conflict notice does, and in what order. */

function makeFakes(failed: PendingMutation[] = [], resolved = true) {
  const calls: string[] = [];
  const table = {
    resolveReplicationConflict: vi.fn(async (_id: string, choice: string) => {
      calls.push(`resolve ${choice}`);
      return resolved;
    }),
  } as unknown as ConflictChoiceTable;
  const queue = {
    sendRowNow: vi.fn(async () => {
      calls.push('send');
      return [];
    }),
    getFailedMutations: vi.fn(async () => failed),
    discardFailedMutation: vi.fn(async (id: string) => {
      calls.push(`discard failed ${id}`);
    }),
    discardPendingMutationsForRow: vi.fn(async () => {
      calls.push('discard queued');
    }),
  } as unknown as ConflictChoiceQueue;
  return { table, queue, calls };
}

function refusal(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: 'm1',
    authUserId: 'judge',
    tableName: 'classes',
    operation: 'UPDATE',
    rowId: 'c1',
    data: { status: 'in_progress' },
    timestamp: 0,
    retries: 1,
    status: 'failed',
    error: 'Non-retryable error: Not authorized to update class c1',
    failureKind: 'authorization',
    failedAt: Date.now() + 1_000,
    ...overrides,
  };
}

describe('Keep my change', () => {
  it('sends the kept write as soon as the conflict is cleared', async () => {
    const { table, queue, calls } = makeFakes();

    expect(await keepMyChange(table, queue, 'classes', 'c1')).toEqual({ kind: 'kept' });

    expect(queue.sendRowNow).toHaveBeenCalledWith('classes', 'c1');
    expect(calls).toEqual(['resolve keep-local', 'send']);
    expect(queue.discardFailedMutation).not.toHaveBeenCalled();
  });

  it('sends nothing when the conflict was already resolved somewhere else', async () => {
    const { table, queue } = makeFakes([], false);

    expect(await keepMyChange(table, queue, 'classes', 'c1')).toEqual({ kind: 'kept' });

    expect(queue.sendRowNow).not.toHaveBeenCalled();
  });

  it('a refused write is discarded, so the row shows the server again, and says why', async () => {
    const { table, queue, calls } = makeFakes([refusal()]);

    expect(await keepMyChange(table, queue, 'classes', 'c1')).toEqual({
      kind: 'refused',
      mutationIds: ['m1'],
      reason: "You don't have permission to change this class.",
    });
    expect(calls).toEqual(['resolve keep-local', 'send', 'discard failed m1']);
  });

  it('ends a reason with a full stop before the second sentence', async () => {
    const { table, queue } = makeFakes([
      refusal({ error: 'Non-retryable error: Nothing to update', failureKind: 'permanent' }),
    ]);

    const outcome = await keepMyChange(table, queue, 'classes', 'c1');

    expect(outcome).toMatchObject({ kind: 'refused', reason: 'Reason: Nothing to update.' });
  });

  it('leaves older failures and other rows alone', async () => {
    const { table, queue } = makeFakes([
      refusal({ id: 'old', failedAt: 1 }),
      refusal({ id: 'other-row', rowId: 'c2' }),
      refusal({ id: 'other-table', tableName: 'entries' }),
    ]);

    expect(await keepMyChange(table, queue, 'classes', 'c1')).toEqual({ kind: 'kept' });
    expect(queue.discardFailedMutation).not.toHaveBeenCalled();
  });
});

describe('Keep the other change', () => {
  it('drops the queued write before the row leaves the conflict', async () => {
    const { table, queue, calls } = makeFakes();

    await keepOtherChange(table, queue, 'classes', 'c1');

    expect(queue.discardPendingMutationsForRow).toHaveBeenCalledWith('classes', 'c1');
    expect(calls).toEqual(['discard queued', 'resolve take-remote']);
    expect(queue.sendRowNow).not.toHaveBeenCalled();
  });

  it('keeps the conflict open when the queued write could not be dropped', async () => {
    const { table, queue } = makeFakes();
    vi.mocked(queue.discardPendingMutationsForRow).mockRejectedValueOnce(new Error('signed out'));

    await expect(keepOtherChange(table, queue, 'classes', 'c1')).rejects.toThrow('signed out');
    expect(table.resolveReplicationConflict).not.toHaveBeenCalled();
  });
});
