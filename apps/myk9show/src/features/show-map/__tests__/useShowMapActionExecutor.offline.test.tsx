/**
 * Show Map class and entry actions are offline-first writes. With the app's query client
 * (default mutation networkMode 'online'), an offline mutation pauses BEFORE its function runs,
 * so nothing reaches the replica or the queue, the executor stays busy, and a reload loses it.
 * Pinned with the real client, like useJudgeSignOffMutations.offline.test.tsx.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const showUndoToast = vi.hoisted(() => vi.fn());

const writes = vi.hoisted(() => ({
  markShowMapClassStarted: vi.fn(async () => undefined),
  markShowMapClassComplete: vi.fn(async () => undefined),
  markShowMapEntryCheckedIn: vi.fn(async () => undefined),
  scratchShowMapEntry: vi.fn(async (entryId: string) => ({
    entryId,
    previousEntryStatus: 'approved',
    previousCheckInStatus: null,
    previousSpecialRequests: null,
    previousWithdrawalReason: null,
    previousWithdrawalReasonCode: null,
  })),
  undoShowMapScratch: vi.fn(async () => undefined),
}));

vi.mock('../showMapActionMutations', async importOriginal => ({
  ...(await importOriginal<typeof import('../showMapActionMutations')>()),
  ...writes,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'auth-secretary' } }) }));
vi.mock('@/lib/undoToast', () => ({ showUndoToast }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { createAppQueryClient } from '@/lib/queryClient';
import { showMapActionExecutionById } from '../showMapActionExecution';
import type { ShowMapAction } from '../showMapActions';
import { useShowMapActionExecutor } from '../useShowMapActionExecutor';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createAppQueryClient()}>{children}</QueryClientProvider>;
}

const action = (overrides: Partial<ShowMapAction>): ShowMapAction =>
  ({ id: 'x', label: 'x', nodeId: 'entry:e1', classId: 'c1', ...overrides }) as ShowMapAction;

describe('Show Map actions while offline', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    Object.values(writes).forEach(fn => fn.mockClear());
    showUndoToast.mockClear();
  });

  it.each([
    ['mark-class-started', 'markShowMapClassStarted', 'c1', 'class:c1'],
    ['mark-class-complete', 'markShowMapClassComplete', 'c1', 'class:c1'],
    ['mark-checked-in', 'markShowMapEntryCheckedIn', 'e1', 'entry:e1'],
  ] as const)('%s runs its replicated write with no network', async (id, writer, arg, nodeId) => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useShowMapActionExecutor({ showId: 's1' }), { wrapper });
    const execution = showMapActionExecutionById[id];
    if (execution.kind !== 'mutation') throw new Error('expected a mutation execution');

    act(() => result.current.executeAction(action({ nodeId }), execution));

    await waitFor(() => expect(writes[writer]).toHaveBeenCalledWith(arg));
    await waitFor(() => expect(result.current.isExecuting).toBe(false));
  });

  it('pull and undo-pull run their replicated writes with no network', async () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useShowMapActionExecutor({ showId: 's1' }), { wrapper });

    act(() =>
      result.current.executeAction(action({}), { kind: 'dialog', dialog: 'scratch-entry' })
    );
    act(() => result.current.confirmScratchNoShow('sick'));

    await waitFor(() => expect(writes.scratchShowMapEntry).toHaveBeenCalledWith('e1', 'sick'));
    await waitFor(() => expect(showUndoToast).toHaveBeenCalled());

    act(() => showUndoToast.mock.calls[0]?.[0].onUndo());
    await waitFor(() =>
      expect(writes.undoShowMapScratch).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: 'e1', classId: 'c1' })
      )
    );
  });
});
