import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBulkJudgeAssignment, type BulkJudgeClass } from './useBulkJudgeAssignment';

const run = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useBulkDispatch', () => ({
  useBulkDispatch: () => ({ run, isBusy: false }),
}));

const upsertClassJudgeAssignment = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const cls = (id: string, locked = false): BulkJudgeClass => ({
  id,
  trialId: 'trial-1',
  name: id,
  locked,
});

describe('bulk Assign judge (MYK9-1324)', () => {
  beforeEach(() => {
    run.mockReset();
    run.mockResolvedValue({ succeeded: [], failed: [] });
  });

  it('writes only the classes that have not started', async () => {
    const { result } = renderHook(
      () =>
        useBulkJudgeAssignment(
          'show-1',
          () => undefined,
          () => false
        ),
      { wrapper }
    );

    await result.current.assign([cls('c1'), cls('c2', true)], 'judge-1');

    expect(run.mock.calls[0]?.[0]).toEqual([cls('c1')]);
  });

  it('re-checks the lock on the freshest data before a retry writes a class again', async () => {
    // A class that started after the first attempt must keep its judge on "Retry failed".
    const lockedNow = new Set<string>();
    const { result } = renderHook(
      () =>
        useBulkJudgeAssignment(
          'show-1',
          () => undefined,
          id => lockedNow.has(id)
        ),
      { wrapper }
    );

    await result.current.assign([cls('c1')], 'judge-1');
    const { applicableWhen } = run.mock.calls[0]?.[2] as {
      applicableWhen: (item: BulkJudgeClass) => boolean;
    };

    expect(applicableWhen(cls('c1'))).toBe(true);
    lockedNow.add('c1');
    expect(applicableWhen(cls('c1'))).toBe(false);
  });
});
