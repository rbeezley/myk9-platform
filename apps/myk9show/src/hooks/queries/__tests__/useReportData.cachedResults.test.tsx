import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useReportData } from '../useReportData';
import { getEntriesByShow } from '@/services/database/entries/reads';
import { mapScopedReportEntries } from '@/pages/secretary/ReportsPage/reportDataMapping';
import { ResultsSheet } from '@/components/reports/ResultsSheet';
import { HighInTrialReport } from '@/components/reports/HighInTrialReport';
import type { DbClass, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const mocks = vi.hoisted(() => ({ read: vi.fn(), from: vi.fn() }));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { sync: vi.fn().mockRejectedValue(new Error('offline')) },
}));
vi.mock('@/services/database/_shared/read-shape', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/_shared/read-shape')>()),
  readWithReplicationFallback: mocks.read,
}));
vi.mock('@/services/database/supabaseClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/supabaseClient')>()),
  supabase: { from: mocks.from },
}));
vi.mock('@/services/database/trials', () => ({
  getTrialsByShow: vi.fn().mockResolvedValue({ data: [{ id: 'trial-1' }], error: null }),
}));
vi.mock('@/services/database/classes', () => ({
  getClassesByTrialId: vi.fn().mockResolvedValue({
    data: [
      { id: 'class-1', trial_id: 'trial-1', element: 'Container', level: 'Novice' },
      { id: 'class-2', trial_id: 'trial-1', element: 'Interior', level: 'Novice' },
    ],
    error: null,
  }),
}));
vi.mock('@/services/database/dogs/reads', () => ({
  loadDogRegistrations: vi
    .fn()
    .mockResolvedValue({ byDog: new Map(), registrationsReadComplete: false }),
}));

const cachedEntries = ['class-1', 'class-2'].map((classId, index) => ({
  id: `entry-${index}`,
  show_id: 'show-1',
  class_id: classId,
  dog_id: 'dog-1',
  armband: '101',
  is_scored: true,
  result_status: 'qualified',
  search_time_seconds: 38.5,
  final_placement: 1,
  total_faults: 0,
  entry_status: 'confirmed',
  dog: { id: 'dog-1', call_name: 'Ranger' },
}));

function unavailableView(failure: string) {
  const request = vi.fn(() =>
    failure === 'stall'
      ? new Promise<never>(() => {})
      : failure === 'throw'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ data: null, error: new Error('unavailable') })
  );
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    range: request,
  };
  mocks.from.mockReturnValue(query);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ data: cachedEntries, error: null });
});
afterEach(() => vi.useRealTimers());

describe('MYK9-424 authorized warm secretary report replay', () => {
  it.each(['error', 'throw', 'stall'])(
    'keeps trial Q/time/placement and HIT printable on endpoint %s',
    async failure => {
      unavailableView(failure);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const hook = renderHook(
        () => useReportData({ show: { id: 'show-1' } as Show, trialId: 'trial-1', classId: 'all' }),
        { wrapper }
      );
      try {
        await waitFor(() => expect(hook.result.current.isReady).toBe(true));
        const data = hook.result.current;
        const entries = mapScopedReportEntries(
          data.entries ?? [],
          data.trials as DbTrial[],
          data.classes as DbClass[],
          { kind: 'trial', showId: 'show-1', trialId: 'trial-1' }
        );
        const props = {
          showName: 'Secretary warm-cache replay',
          entries,
          sortOrder: 'placement',
          organization: 'AKC',
        };
        const results = renderToStaticMarkup(<ResultsSheet {...props} />);
        expect(results).toContain('Qualified Entries: 2');
        expect(results).toContain('38.50');
        expect(results).toContain('class="place-cell">1</td>');
        const hit = renderToStaticMarkup(
          <HighInTrialReport
            {...props}
            allClasses={[
              { id: 'class-1', trialId: 'trial-1', element: 'Container', level: 'Novice' },
              { id: 'class-2', trialId: 'trial-1', element: 'Interior', level: 'Novice' },
            ]}
          />
        );
        expect(hit).toContain('Ranger');
        expect(hit).toContain('01:17.00');
        expect(hit).not.toContain('No eligible');
        expect(mocks.from).not.toHaveBeenCalled();
      } finally {
        hook.unmount();
        client.clear();
      }
    }
  );

  it('settles a stalled exhibitor show read without exposing cached scores', async () => {
    vi.useFakeTimers();
    unavailableView('stall');
    const done = vi.fn();
    const pending = getEntriesByShow('show-1').then(done);
    await vi.advanceTimersByTimeAsync(6000);
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({
        resultsReadComplete: false,
        data: expect.arrayContaining([
          expect.objectContaining({ result_status: null, final_placement: null }),
        ]),
      })
    );
    await pending;
  });
});
