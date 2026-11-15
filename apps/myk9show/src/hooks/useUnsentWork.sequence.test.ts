/**
 * MYK9-2013 review: overlapping reads of this device (an event during a slow read) must not let
 * an older read that finishes last put back a stale count.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UnsentWork } from '@/services/replication/unsentWork';

const reads = vi.hoisted(() => ({ resolvers: [] as ((work: UnsentWork) => void)[] }));
vi.mock('@/services/replication/unsentWork', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication/unsentWork')>();
  return {
    ...actual,
    readDeviceUnsentWork: () =>
      new Promise<UnsentWork>(resolve => {
        reads.resolvers.push(resolve);
      }),
  };
});

import { EMPTY_UNSENT_WORK } from '@/services/replication/unsentWork';
import { announceUnsentChanged, useUnsentWorkState } from './useUnsentWork';

const total = (n: number): UnsentWork => ({ ...EMPTY_UNSENT_WORK, unsentScoreCount: n, total: n });

describe('useUnsentWorkState read order', () => {
  it('keeps the newest read when an older one finishes last', async () => {
    const { result } = renderHook(() => useUnsentWorkState());
    await act(async () => {
      announceUnsentChanged();
    });
    expect(reads.resolvers).toHaveLength(2);

    await act(async () => {
      reads.resolvers[1]?.(total(0));
    });
    await waitFor(() => expect(result.current.status).toBe('known'));
    await act(async () => {
      reads.resolvers[0]?.(total(3));
    });

    expect(result.current.work.total).toBe(0);
  });
});
