import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showUndoToast } from '@/lib/undoToast';
import { StaleCheckInError } from '@/services/show-day/checkInStatus';
import { offerPullUndo } from './offerPullUndo';
import { registerPull, undoPullIfCurrent } from './pullUndoGuard';

const { toastInfo, getEntryById } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  getEntryById: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { info: toastInfo, error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: vi.fn() }));
vi.mock('@/services/replication', () => ({ replicatedEntriesTable: { getEntryById } }));

const NOTICE = "Hazel's status changed after the Pull, so Undo did nothing.";

let counter = 0;
function pull(writer: 'replicated' | 'self-checkin-rpc', prior = 'checked-in') {
  counter += 1;
  const id = `entry-${counter}`;
  const restore = vi.fn();
  offerPullUndo(
    { id, callName: 'Hazel', status: prior, className: 'Novice A', section: 'A' } as never,
    writer,
    restore
  );
  const calls = vi.mocked(showUndoToast).mock.calls;
  const undo = calls[calls.length - 1]?.[0].onUndo;
  if (!undo) throw new Error('no undo offered');
  return { id, restore, undo };
}

const replicaNow = (status: string | null) =>
  getEntryById.mockResolvedValue(status === null ? null : { checkInStatus: status });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Pull Undo only restores the Pull it owns (MYK9-1880)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('an immediate Undo restores the prior status', async () => {
    const { restore, undo } = pull('replicated');
    replicaNow('pulled');
    undo();
    await flush();
    expect(restore).toHaveBeenCalledWith('checked-in');
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it.each(['checked-in', 'in-ring', 'completed', 'at-gate'])(
    'writes nothing and says so when another writer set %s after the Pull',
    async newer => {
      const { restore, undo } = pull('replicated', 'no-status');
      replicaNow(newer);
      undo();
      await flush();
      expect(restore).not.toHaveBeenCalled();
      expect(toastInfo).toHaveBeenCalledWith(NOTICE);
    }
  );

  it('writes nothing when the dog was pulled again after this Pull', async () => {
    const restore = vi.fn();
    const row = { id: 'same-dog', callName: 'Hazel', status: 'no-status' } as never;
    offerPullUndo(row, 'replicated', restore);
    const oldUndo = vi.mocked(showUndoToast).mock.calls.at(-1)?.[0].onUndo;
    offerPullUndo({ ...(row as object), status: 'checked-in' } as never, 'replicated', restore);
    replicaNow('pulled');
    oldUndo?.();
    await flush();
    expect(restore).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledWith(NOTICE);
  });

  it('an offline Pull still restores: the replica holds the queued Pull', async () => {
    const { restore, undo } = pull('replicated');
    replicaNow('pulled');
    undo();
    await flush();
    expect(restore).toHaveBeenCalledWith('checked-in');
  });

  it('an exhibitor Undo restores even though the replica still says no-status', async () => {
    // The RPC never touches the replica: it holds a stale row, the UI prior status is fresher.
    const { restore, undo } = pull('self-checkin-rpc', 'checked-in');
    replicaNow('no-status');
    undo();
    await flush();
    expect(restore).toHaveBeenCalledWith('checked-in');
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('an exhibitor Undo never consults the replica', async () => {
    const { undo } = pull('self-checkin-rpc');
    replicaNow('in-ring');
    undo();
    await flush();
    expect(getEntryById).not.toHaveBeenCalled();
  });

  it('an exhibitor re-Pull on this device kills the older Undo', async () => {
    const restore = vi.fn();
    const row = { id: 'exhibitor-dog', callName: 'Hazel', status: 'checked-in' } as never;
    offerPullUndo(row, 'self-checkin-rpc', restore);
    const oldUndo = vi.mocked(showUndoToast).mock.calls.at(-1)?.[0].onUndo;
    offerPullUndo(row, 'self-checkin-rpc', restore);
    oldUndo?.();
    await flush();
    expect(restore).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledWith(NOTICE);
  });

  it('still restores when the replica row cannot be read', async () => {
    const { restore, undo } = pull('replicated');
    getEntryById.mockRejectedValue(new Error('no replica'));
    undo();
    await flush();
    expect(restore).toHaveBeenCalledWith('checked-in');
  });

  it('shows the notice, without crashing, when the server refuses a superseded exhibitor Undo', async () => {
    // MYK9-1911: another device moved the dog on; the RPC raised MK911 and wrote nothing.
    const { restore, undo } = pull('self-checkin-rpc');
    restore.mockRejectedValue(new StaleCheckInError());
    undo();
    await flush();
    expect(restore).toHaveBeenCalledWith('checked-in');
    expect(toastInfo).toHaveBeenCalledWith(NOTICE);
  });

  it('does not swallow a real failure as a superseded Undo', async () => {
    const restore = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      undoPullIfCurrent({
        entryId: 'real-failure',
        token: registerPull('real-failure'),
        callName: 'Hazel',
        replicaMayLag: true,
        restore,
      })
    ).rejects.toThrow('network down');
    expect(toastInfo).not.toHaveBeenCalled();
  });
});
