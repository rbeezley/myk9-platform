/**
 * Tests for the Change class toast in useShowMapActionExecutor (MYK9-1940): it names the dog and
 * the class it went to, goes through the shared Undo helper with the shared duration, and its Undo
 * moves the dog back.
 */
import React from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { STATUS_UNDO_WINDOW_MS } from '@/lib/undoToast';
import { useShowMapActionExecutor } from '../useShowMapActionExecutor';
import type { ShowMapAction } from '../showMapActions';

const { moveUpShowMapEntryMock, undoShowMapMoveUpMock } = vi.hoisted(() => ({
  moveUpShowMapEntryMock: vi.fn(),
  undoShowMapMoveUpMock: vi.fn(),
}));

vi.mock('../showMapActionMutations', async () => {
  const actual = await vi.importActual<typeof import('../showMapActionMutations')>(
    '../showMapActionMutations'
  );
  return {
    ...actual,
    moveUpShowMapEntry: moveUpShowMapEntryMock,
    undoShowMapMoveUp: undoShowMapMoveUpMock,
  };
});

const { showUndoToast } = vi.hoisted(() => ({ showUndoToast: vi.fn() }));
vi.mock('@/lib/undoToast', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/undoToast')>()),
  showUndoToast,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/store/messageStore', () => ({
  useMessageStore: (selector: (s: unknown) => unknown) =>
    selector({
      getOrCreateThread: vi.fn(),
      sendMessage: vi.fn(),
    }),
}));

function makeMoveUpAction(nodeId: string, classId: string): ShowMapAction {
  return {
    id: 'move-up-entry',
    nodeId,
    label: `Move up ${nodeId}`,
    why: 'Move up',
    priority: 32,
    icon: ArrowUpCircle,
    classId,
  };
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

async function triggerMoveUp(
  result: { current: ReturnType<typeof useShowMapActionExecutor> },
  action: ShowMapAction,
  targetClassId: string
) {
  await act(async () => {
    result.current.executeAction(action, { kind: 'dialog', dialog: 'move-up-entry' });
  });
  await act(async () => {
    result.current.confirmMoveUp({ targetClassId });
  });
}

describe('useShowMapActionExecutor: Change class says what happened, with Undo', () => {
  beforeEach(() => {
    moveUpShowMapEntryMock.mockReset().mockResolvedValue({
      originalEntryId: 'entry-1',
      newEntryId: 'entry-2',
      previousEntryStatus: 'pre-entered',
      previousCheckInStatus: null,
      previousSpecialRequests: null,
      targetClassName: 'Novice A',
    });
    undoShowMapMoveUpMock.mockReset().mockResolvedValue(undefined);
    showUndoToast.mockReset();
  });

  it('names the dog and the class it went to, with the shared duration', async () => {
    const { result } = renderHook(
      () =>
        useShowMapActionExecutor({
          showId: 'show-1',
          entryLabelOf: () => '#110 Hazel',
        }),
      { wrapper: createWrapper() }
    );

    await triggerMoveUp(result, makeMoveUpAction('entry:entry-1', 'class-1'), 'class-2');

    expect(showUndoToast).toHaveBeenCalledTimes(1);
    expect(showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '#110 Hazel: Moved to Novice A',
        duration: STATUS_UNDO_WINDOW_MS,
      })
    );
  });

  it('Undo moves the dog back from the class it went to', async () => {
    const { result } = renderHook(
      () => useShowMapActionExecutor({ showId: 'show-1', entryLabelOf: () => '#110 Hazel' }),
      { wrapper: createWrapper() }
    );
    await triggerMoveUp(result, makeMoveUpAction('entry:entry-1', 'class-1'), 'class-2');

    await act(async () => {
      showUndoToast.mock.calls[0]?.[0].onUndo();
    });

    expect(undoShowMapMoveUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originalEntryId: 'entry-1',
        newEntryId: 'entry-2',
        targetClassId: 'class-2',
      })
    );
  });

  it('closes the Change class dialog once the change is made', async () => {
    const { result } = renderHook(() => useShowMapActionExecutor({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });
    await triggerMoveUp(result, makeMoveUpAction('entry:entry-1', 'class-1'), 'class-2');
    expect(result.current.moveUpAction).toBeNull();
  });
});
