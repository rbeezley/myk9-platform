/**
 * Tests for the scratch/no-show undo affordance in useShowMapActionExecutor.
 *
 * Mirrors the move-up undo mutation but surfaces the undo as a sonner toast
 * action (per design D2) rather than a persistent banner.
 */
import React from 'react';
import { XCircle } from 'lucide-react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useShowMapActionExecutor } from '../useShowMapActionExecutor';
import type { ShowMapAction } from '../showMapActions';

const { scratchShowMapEntryMock, undoShowMapScratchMock } = vi.hoisted(() => ({
  scratchShowMapEntryMock: vi.fn(),
  undoShowMapScratchMock: vi.fn(),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('../showMapActionMutations', async () => {
  const actual = await vi.importActual<typeof import('../showMapActionMutations')>(
    '../showMapActionMutations'
  );
  return {
    ...actual,
    scratchShowMapEntry: scratchShowMapEntryMock,
    undoShowMapScratch: undoShowMapScratchMock,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock('@/store/messageStore', () => ({
  useMessageStore: (selector: (s: unknown) => unknown) =>
    selector({
      getOrCreateThread: vi.fn(),
      sendMessage: vi.fn(),
    }),
}));

function makeScratchAction(nodeId: string, classId: string): ShowMapAction {
  return {
    id: 'scratch-entry',
    nodeId,
    label: `Scratch ${nodeId}`,
    why: 'Scratch',
    priority: 40,
    icon: XCircle,
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

async function triggerScratch(
  result: { current: ReturnType<typeof useShowMapActionExecutor> },
  action: ShowMapAction,
  reason: string | undefined
) {
  await act(async () => {
    result.current.executeAction(action, { kind: 'dialog', dialog: 'scratch-entry' });
  });
  await act(async () => {
    result.current.confirmScratchNoShow(reason);
  });
}

describe('useShowMapActionExecutor — scratch/no-show undo', () => {
  beforeEach(() => {
    scratchShowMapEntryMock.mockReset();
    undoShowMapScratchMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it('surfaces a toast with an Undo action after a successful scratch', async () => {
    scratchShowMapEntryMock.mockResolvedValue({
      entryId: 'entry-1',
      previousEntryStatus: 'checked-in',
      previousCheckInStatus: 'checked-in',
      previousSpecialRequests: 'Bring paper form',
      previousWithdrawalReason: null,
    });

    const { result } = renderHook(() => useShowMapActionExecutor({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });

    await triggerScratch(result, makeScratchAction('entry:entry-1', 'class-1'), 'Dog absent');

    expect(scratchShowMapEntryMock).toHaveBeenCalledWith('entry-1', 'Dog absent');
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Entry marked pulled',
      expect.objectContaining({
        action: expect.objectContaining({
          label: 'Undo',
          onClick: expect.any(Function),
        }),
      })
    );
    expect(result.current.scratchAction).toBeNull();
  });

  it('restores the entry via replicated writes when the toast Undo action is clicked', async () => {
    scratchShowMapEntryMock.mockResolvedValue({
      entryId: 'entry-1',
      previousEntryStatus: 'checked-in',
      previousCheckInStatus: 'checked-in',
      previousSpecialRequests: 'Bring paper form',
      previousWithdrawalReason: null,
    });
    undoShowMapScratchMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useShowMapActionExecutor({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });

    await triggerScratch(result, makeScratchAction('entry:entry-1', 'class-1'), 'Dog absent');

    const toastCall = toastSuccessMock.mock.calls.find(
      ([message]) => message === 'Entry marked pulled'
    );
    const undoOnClick = toastCall?.[1]?.action?.onClick;
    expect(typeof undoOnClick).toBe('function');

    await act(async () => {
      undoOnClick();
    });

    expect(undoShowMapScratchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'entry-1',
        previousEntryStatus: 'checked-in',
        previousCheckInStatus: 'checked-in',
        previousSpecialRequests: 'Bring paper form',
        previousWithdrawalReason: null,
      })
    );
    expect(toastSuccessMock).toHaveBeenCalledWith('Scratch undone');
  });

  it('surfaces an error toast when undo fails', async () => {
    scratchShowMapEntryMock.mockResolvedValue({
      entryId: 'entry-1',
      previousEntryStatus: 'checked-in',
      previousCheckInStatus: 'checked-in',
      previousSpecialRequests: null,
      previousWithdrawalReason: null,
    });
    undoShowMapScratchMock.mockRejectedValue(new Error('replica unavailable'));

    const { result } = renderHook(() => useShowMapActionExecutor({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });

    await triggerScratch(result, makeScratchAction('entry:entry-1', 'class-1'), 'Dog absent');

    const toastCall = toastSuccessMock.mock.calls.find(
      ([message]) => message === 'Entry marked pulled'
    );
    const undoOnClick = toastCall?.[1]?.action?.onClick;

    await act(async () => {
      undoOnClick();
    });

    expect(toastErrorMock).toHaveBeenCalled();
  });
});
