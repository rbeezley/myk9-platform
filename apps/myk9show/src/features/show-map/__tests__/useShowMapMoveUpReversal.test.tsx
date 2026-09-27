/**
 * MYK9-821 (1/3): after a REFUSED Move back (a stale/superseded reversal —
 * either the client's own "superseded" check or the server's "has a newer
 * successor" refusal), the dialog stayed open still offering Move back,
 * because only the success path closed it. A refusal must close the dialog
 * too, the same way a successful reversal already does.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useShowMapMoveUpReversal } from '../useShowMapMoveUpReversal';
import { MoveUpRpcError } from '@/services/replication/moveUpEntryRpc';

const { resolveMoveUpReversalMock, reverseShowMapMoveUpMock } = vi.hoisted(() => ({
  resolveMoveUpReversalMock: vi.fn(),
  reverseShowMapMoveUpMock: vi.fn(),
}));

vi.mock('../moveUpSupersession', async () => {
  const actual =
    await vi.importActual<typeof import('../moveUpSupersession')>('../moveUpSupersession');
  return {
    ...actual,
    resolveMoveUpReversal: resolveMoveUpReversalMock,
    reverseShowMapMoveUp: reverseShowMapMoveUpMock,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe('useShowMapMoveUpReversal — refused Move back (MYK9-821)', () => {
  beforeEach(() => {
    resolveMoveUpReversalMock.mockReset();
    reverseShowMapMoveUpMock.mockReset();
    resolveMoveUpReversalMock.mockResolvedValue({
      kind: 'available',
      destinationEntryId: 'entry-dest-1',
      sourceEntryId: 'entry-source-1',
      sourceClassId: 'class-novice',
      sourceClassName: 'Interior Novice A',
    });
  });

  it('closes the dialog when the server refuses a stale reversal ("has a newer successor")', async () => {
    reverseShowMapMoveUpMock.mockRejectedValue(
      new MoveUpRpcError('refused', 'This move-up has a newer successor.')
    );
    const onClose = vi.fn();
    const onReversed = vi.fn();

    const { result } = renderHook(
      () => useShowMapMoveUpReversal({ entryId: 'entry-dest-1', onReversed, onClose }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.moveUpReversal?.kind).toBe('available'));

    act(() => {
      result.current.reverseMoveUp();
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onReversed).not.toHaveBeenCalled();
  });

  it('closes the dialog when the client refuses a superseded reversal', async () => {
    reverseShowMapMoveUpMock.mockRejectedValue(
      new MoveUpRpcError(
        'refused',
        'This move-up has since been superseded by another move-up, so it cannot be reversed here.'
      )
    );
    const onClose = vi.fn();
    const onReversed = vi.fn();

    const { result } = renderHook(
      () => useShowMapMoveUpReversal({ entryId: 'entry-dest-1', onReversed, onClose }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.moveUpReversal?.kind).toBe('available'));

    act(() => {
      result.current.reverseMoveUp();
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onReversed).not.toHaveBeenCalled();
  });

  it('still closes the dialog on success, unaffected by the refusal fix', async () => {
    reverseShowMapMoveUpMock.mockResolvedValue({
      destinationEntryId: 'entry-dest-1',
      sourceEntryId: 'entry-source-1',
      sourceClassId: 'class-novice',
      sourceClassName: 'Interior Novice A',
    });
    const onClose = vi.fn();
    const onReversed = vi.fn();

    const { result } = renderHook(
      () => useShowMapMoveUpReversal({ entryId: 'entry-dest-1', onReversed, onClose }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.moveUpReversal?.kind).toBe('available'));

    act(() => {
      result.current.reverseMoveUp();
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onReversed).toHaveBeenCalledWith(['class-novice']);
  });
});
