import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordCoinFlips = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('@/features/show-map/classTiesMutations', () => ({ recordCoinFlips }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));

import { createTestQueryClient } from '@/test/utils/testUtils';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRecordCoinFlip } from './useRecordCoinFlip';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
);
const input = { classId: 'class-1', trialId: 'trial-1', orders: [['a', 'b']] };

beforeEach(() => {
  recordCoinFlips.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe('useRecordCoinFlip', () => {
  it('saves the orders for the class and says so', async () => {
    recordCoinFlips.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRecordCoinFlip('show-1'), { wrapper });

    await act(() => result.current.save(input));

    expect(recordCoinFlips).toHaveBeenCalledWith({ classId: 'class-1', orders: [['a', 'b']] });
    expect(toastSuccess).toHaveBeenCalledWith('Coin flip saved');
  });

  it.each([
    ['MK016', 'These dogs are no longer tied. Close this and look at the class again.'],
    ['55P03', 'Someone is scoring this class right now. Try again in a moment.'],
  ])('shows the plain-words message for %s', async (code, message) => {
    recordCoinFlips.mockRejectedValue({ code });
    const { result } = renderHook(() => useRecordCoinFlip('show-1'), { wrapper });

    await act(async () => {
      await result.current.save(input).catch(() => undefined);
    });

    expect(toastError).toHaveBeenCalledWith(message);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
