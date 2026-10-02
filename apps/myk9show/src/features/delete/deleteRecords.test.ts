import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  restore: vi.fn(),
  purge: vi.fn(),
  refresh: vi.fn(),
  order: [] as string[],
}));

vi.mock('./deleteServer', () => ({
  softDeleteOnServer: mocks.remove,
  restoreOnServer: mocks.restore,
}));
vi.mock('./deleteLocalState', () => ({
  reconcileLocalDeletion: mocks.purge,
  reconcileLocalRestore: mocks.refresh,
}));

import { canStillUndo, deleteRecords, restoreRecords } from './deleteRecords';
import {
  classifyDeleteError,
  classifyPreviewError,
  deleteErrorMessage,
  isRetryableRestoreError,
  restoreErrorMessage,
} from './deleteErrors';
import { parseDeletePreview } from './deletePreview';
import { UNDO_WINDOW_MS } from './deleteTypes';

const show = { id: 'show-1', name: 'Heartland Classic' };

describe('deleteRecords: the one client delete service', () => {
  beforeEach(() => {
    mocks.order.length = 0;
    mocks.remove.mockReset().mockImplementation(async () => {
      mocks.order.push('server');
    });
    mocks.purge.mockReset().mockImplementation(async () => {
      mocks.order.push('purge');
    });
  });

  it('soft-deletes on the server first, then purges this device', async () => {
    const result = await deleteRecords('show', [show]);

    expect(mocks.remove).toHaveBeenCalledWith('show', 'show-1', {});
    expect(mocks.purge).toHaveBeenCalledWith('show', show);
    expect(mocks.order).toEqual(['server', 'purge']);
    expect(result.deleted).toEqual([show]);
    expect(result.failed).toEqual([]);
  });

  it('passes the site-admin override through to the server call', async () => {
    await deleteRecords('dog', [{ id: 'dog-1', name: 'Biscuit' }], { override: true });
    expect(mocks.remove).toHaveBeenCalledWith('dog', 'dog-1', { override: true });
  });

  it('does not purge, and reports a plain reason, when the server refuses', async () => {
    mocks.remove.mockRejectedValue({ code: 'MK010', message: 'raw server text' });

    const result = await deleteRecords('show', [show]);

    expect(mocks.purge).not.toHaveBeenCalled();
    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([
      {
        target: show,
        message: 'This show has paid or scored entries. Cancel the show instead of deleting it.',
      },
    ]);
  });

  it('treats "already deleted" (P0002) as gone: purged, but not offered for Undo', async () => {
    mocks.remove.mockRejectedValue({ code: 'P0002', message: 'Show not found or already deleted' });

    const result = await deleteRecords('show', [show]);

    expect(mocks.purge).toHaveBeenCalledWith('show', show);
    expect(result.alreadyGone).toEqual([show]);
    expect(result.deleted).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('keeps a mixed bulk result in the caller’s order', async () => {
    mocks.remove.mockImplementation(async (_kind: string, id: string) => {
      if (id === 'b') throw { code: '42501', message: 'Permission denied' };
    });

    const result = await deleteRecords('class', [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]);

    expect(result.deleted.map(t => t.id)).toEqual(['a', 'c']);
    expect(result.failed).toEqual([
      {
        target: { id: 'b', name: 'B' },
        message: "You don't have permission to delete this class.",
      },
    ]);
  });
});

describe('restoreRecords: Undo', () => {
  beforeEach(() => {
    mocks.restore.mockReset().mockResolvedValue(undefined);
    mocks.refresh.mockReset().mockResolvedValue(undefined);
  });

  it('restores on the server and brings the rows back to this device', async () => {
    const result = await restoreRecords('trial', [
      { id: 't1', name: 'T1', context: { showId: 's1' } },
    ]);

    expect(mocks.restore).toHaveBeenCalledWith('trial', 't1');
    expect(mocks.refresh).toHaveBeenCalledWith('trial', expect.objectContaining({ id: 't1' }));
    expect(result.restored.map(t => t.id)).toEqual(['t1']);
  });

  it('maps a closed Undo window (42501) and a deleted parent (MK013) to plain language', async () => {
    mocks.restore.mockRejectedValueOnce({ code: '42501', message: 'Permission denied' });
    const late = await restoreRecords('entry', [{ id: 'e1', name: 'Biscuit' }]);
    expect(late.failed[0]?.message).toBe(
      'The 10 minutes to undo this are over. Ask a myK9 administrator to restore it.'
    );
    expect(mocks.refresh).not.toHaveBeenCalled();

    expect(
      restoreErrorMessage('class', { code: 'MK013', message: 'Restore the trial first' })
    ).toBe("This can't come back while its trial is deleted. Restore the trial first.");
  });
});

describe('the Undo window', () => {
  it('is open for the deleter for 10 minutes and closed after', () => {
    const deletedAt = 1_000_000;
    expect(canStillUndo(deletedAt, deletedAt + 1)).toBe(true);
    expect(canStillUndo(deletedAt, deletedAt + UNDO_WINDOW_MS - 1)).toBe(true);
    expect(canStillUndo(deletedAt, deletedAt + UNDO_WINDOW_MS)).toBe(false);
  });
});

describe('server refusals in plain language (no raw error text)', () => {
  it.each([
    [
      'show',
      'MK010',
      'This show has paid or scored entries. Cancel the show instead of deleting it.',
    ],
    [
      'trial',
      'MK010',
      'This trial has paid or scored entries. Withdraw or Pull those entries first.',
    ],
    [
      'class',
      'MK010',
      'This class has paid or scored entries. Withdraw or Pull those entries first.',
    ],
    [
      'entry',
      'MK010',
      'This entry has been paid for or scored. Use Withdraw or Pull instead of deleting it.',
    ],
    ['club', 'MK011', 'This club still has shows. Delete or move its shows first.'],
    [
      'person',
      'MK001',
      'This person still owns dogs. Delete those dogs or give them a new owner first.',
    ],
    ['dog', '42501', "You don't have permission to delete this dog."],
  ] as const)('%s %s', (kind, code, expected) => {
    const message = deleteErrorMessage(kind, { code, message: 'SQLSTATE raw: do not show me' });
    expect(message).toBe(expected);
    expect(message).not.toMatch(/SQLSTATE|do not show me/);
  });

  it('a show with unsynced work is "still saving", not a failure', () => {
    expect(deleteErrorMessage('show', { code: 'SHOW_STILL_SAVING', message: 'x' })).toBe(
      'This show is still saving. Try again in a moment.'
    );
  });
});

describe('the SQLSTATE decides, never the message (MYK9-922)', () => {
  it('a 42501 is forbidden even when its message says "not found or already deleted": never purged', async () => {
    const refusal = { code: '42501', message: 'Trial not found or already deleted' };
    expect(classifyDeleteError(refusal)).toBe('forbidden');
    mocks.remove.mockReset().mockRejectedValue(refusal);
    mocks.purge.mockReset();

    const result = await deleteRecords('trial', [{ id: 't1', name: 'Saturday T1' }]);

    expect(mocks.purge).not.toHaveBeenCalled();
    expect(result.alreadyGone).toEqual([]);
    expect(result.failed.map(f => f.message)).toEqual([
      "You don't have permission to delete this trial.",
    ]);
  });

  it('a P0002 is already gone whatever its message says', () => {
    expect(classifyDeleteError({ code: 'P0002', message: 'Permission denied' })).toBe(
      'already-deleted'
    );
  });

  it('a message alone (no code) is a plain failure, not "already deleted"', () => {
    expect(classifyDeleteError({ message: 'Show not found or already deleted' })).toBe('failed');
  });

  it('restore: P0002 is "already back" and final; a "not deleted" message without the code is retryable', () => {
    expect(restoreErrorMessage('dog', { code: 'P0002', message: 'x' })).toBe(
      'This dog is already back.'
    );
    expect(isRetryableRestoreError({ code: 'P0002', message: 'x' })).toBe(false);
    expect(restoreErrorMessage('dog', { message: 'Dog not found or not deleted' })).toBe(
      "We couldn't bring back this dog. Please try again."
    );
    expect(isRetryableRestoreError({ message: 'Dog not found or not deleted' })).toBe(true);
  });

  it('preview: a 42501 is forbidden even when its message says "not found"', () => {
    expect(classifyPreviewError({ code: '42501', message: 'Show not found' })).toBe('forbidden');
  });
});

describe('an ambiguous "not found or permission denied" refusal', () => {
  const ambiguous = { code: '42501', message: 'Dog not found or permission denied' };

  it('is forbidden, never "already deleted", so the dog is not purged from this device', async () => {
    expect(classifyDeleteError(ambiguous)).toBe('forbidden');
    mocks.remove.mockReset().mockRejectedValue(ambiguous);
    mocks.purge.mockReset();

    const result = await deleteRecords('dog', [{ id: 'dog-1', name: 'Biscuit' }]);

    expect(mocks.purge).not.toHaveBeenCalled();
    expect(result.alreadyGone).toEqual([]);
    expect(result.failed.map(f => f.message)).toEqual([
      "You don't have permission to delete this dog.",
    ]);
  });
});

describe('delete_preview reply and failures', () => {
  it('a missing RPC (not yet deployed) reads as unknown, never as zero', () => {
    expect(classifyPreviewError({ code: 'PGRST202', message: 'Could not find the function' })).toBe(
      'failed'
    );
    expect(() => parseDeletePreview({ trials: 1 })).toThrow(/blocking/);
    expect(() => parseDeletePreview(null)).toThrow();
  });

  it('a permission refusal is its own reason', () => {
    expect(classifyPreviewError({ code: '42501', message: 'Permission denied' })).toBe('forbidden');
  });

  it('parses the counts', () => {
    expect(
      parseDeletePreview({
        scope: 'show',
        trials: 2,
        classes: 10,
        entries: 14,
        paid: 3,
        scored: 0,
        blocking: 3,
      })
    ).toEqual({
      trials: 2,
      classes: 10,
      entries: 14,
      shows: 0,
      dogs: 0,
      paid: 3,
      scored: 0,
      blocking: 3,
    });
  });
});
