import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearCachedHideCounts } = vi.hoisted(() => ({
  clearCachedHideCounts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./ReplicatedClassesTable', () => ({
  replicatedClassesTable: { clearCachedHideCounts },
}));

import {
  type ClassHideCacheBoundaryOptions,
  useClassHideCacheBoundary,
} from './useClassHideCacheBoundary';

describe('useClassHideCacheBoundary', () => {
  beforeEach(() => {
    clearCachedHideCounts.mockClear();
  });

  it('preserves the same user cache across the initial session restore', () => {
    const { rerender } = renderHook(
      (options: ClassHideCacheBoundaryOptions) => useClassHideCacheBoundary(options),
      {
        initialProps: {
          authReady: false,
          userId: 'user-1',
          canReadHideCounts: true as boolean | null,
        },
      }
    );

    rerender({ authReady: true, userId: 'user-1', canReadHideCounts: true });

    expect(clearCachedHideCounts).not.toHaveBeenCalled();
  });

  it('scrubs when the account changes or official capability is revoked', () => {
    const { rerender } = renderHook(
      (options: ClassHideCacheBoundaryOptions) => useClassHideCacheBoundary(options),
      {
        initialProps: {
          authReady: true,
          userId: 'user-1',
          canReadHideCounts: true as boolean | null,
        },
      }
    );

    rerender({ authReady: true, userId: 'user-1', canReadHideCounts: false });
    rerender({ authReady: true, userId: 'user-2', canReadHideCounts: null });

    expect(clearCachedHideCounts).toHaveBeenCalledTimes(2);
  });
});
