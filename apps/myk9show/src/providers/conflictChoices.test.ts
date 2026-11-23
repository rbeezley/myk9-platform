import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn() } }));
import {
  keepMyChange,
  keepOtherChange,
  type ConflictChoiceQueue,
  type ConflictChoiceTable,
} from './conflictChoices';

/** MYK9-1993: what each answer to the conflict notice does, and in what order. */

function makeFakes(resolved = true) {
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
    discardPendingMutationsForRow: vi.fn(async () => {
      calls.push('discard queued');
    }),
  } as unknown as ConflictChoiceQueue;
  return { table, queue, calls };
}

describe('Keep my change', () => {
  it('sends the kept write as soon as the conflict is cleared, and nothing more', async () => {
    const { table, queue, calls } = makeFakes();

    await keepMyChange(table, queue, 'classes', 'c1');

    expect(queue.sendRowNow).toHaveBeenCalledWith('classes', 'c1');
    expect(calls).toEqual(['resolve keep-local', 'send']);
    expect(queue.discardPendingMutationsForRow).not.toHaveBeenCalled();
  });

  it('sends nothing when the conflict was already resolved somewhere else', async () => {
    const { table, queue } = makeFakes(false);

    await keepMyChange(table, queue, 'classes', 'c1');

    expect(queue.sendRowNow).not.toHaveBeenCalled();
  });
});

describe('Keep my change failing (MYK9-2337)', () => {
  it('rejects without sending when the row could not be released, so the choice can be asked again', async () => {
    const { table, queue } = makeFakes();
    vi.mocked(table.resolveReplicationConflict).mockRejectedValueOnce(
      new Error('queue unavailable')
    );

    await expect(keepMyChange(table, queue, 'classes', 'c1')).rejects.toThrow('queue unavailable');
    expect(queue.sendRowNow).not.toHaveBeenCalled();
  });

  it('settles once the row is released even if sending now fails, so no second prompt can discard it', async () => {
    const { table, queue } = makeFakes();
    vi.mocked(queue.sendRowNow).mockRejectedValueOnce(new Error('token refresh failed'));

    await expect(keepMyChange(table, queue, 'classes', 'c1')).resolves.toBeUndefined();
    expect(table.resolveReplicationConflict).toHaveBeenCalledWith('c1', 'keep-local');
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
