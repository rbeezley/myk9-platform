/** MYK9-1970: the entry list's class info carries the paper claim, from the replicated rows. */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ClassInfo } from '@myk9/ringside';
import { useClassInfoOnPaper } from './useClassInfoOnPaper';

const mocks = vi.hoisted(() => ({
  show: { usesDeviceScoring: false } as { usesDeviceScoring: boolean } | Promise<never>,
  flag: null as boolean | null,
}));
vi.mock('@/services/replication', () => ({
  replicatedShowsTable: {
    getShowById: () => Promise.resolve(mocks.show),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedTrialsTable: { getTrialsByShow: () => Promise.resolve([{ id: 't1' }]) },
  replicatedClassesTable: {
    getClassesByTrial: () => Promise.resolve([{ id: 'a', scoresOnPaper: mocks.flag }]),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);
const info = { className: 'Novice', actualClassId: 'a' } as ClassInfo;
const run = () => renderHook(() => useClassInfoOnPaper('s1', info), { wrapper });

describe('useClassInfoOnPaper (MYK9-1970)', () => {
  it('withholds now-and-next (unknown) until the rows load, then on a paper class', async () => {
    mocks.show = { usesDeviceScoring: false };
    mocks.flag = null;
    const { result } = run();
    expect(result.current?.paperClaim).toBe('unknown');
    await waitFor(() => expect(result.current?.paperClaim).toBe('paper'));
  });

  it('drops the claim for a phone-scored class once the rows say so', async () => {
    mocks.show = { usesDeviceScoring: true };
    mocks.flag = null;
    const { result } = run();
    await waitFor(() => expect(result.current?.paperClaim).toBeUndefined());
  });
});
