import { useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { captureMonitoredQueryFailure } from '@/services/observability/sentry';
import { prefetchCriticalData } from '@/utils/performanceOptimizations';
import { queryClient } from '@/lib/queryClient';
import { QueryProvider } from './QueryProvider';

vi.mock('@/services/observability/sentry', () => ({
  captureMonitoredQueryFailure: vi.fn(),
}));
vi.mock('@/utils/performanceOptimizations', () => ({
  prefetchCriticalData: vi.fn().mockResolvedValue(undefined),
}));

const monitoredFailureMock = vi.mocked(captureMonitoredQueryFailure);
const prefetchCriticalDataMock = vi.mocked(prefetchCriticalData);

function FailingRoutedQuery({ monitored }: { monitored: boolean }) {
  const query = useQuery({
    queryKey: ['provider-failure', monitored],
    queryFn: async () => {
      throw new Error('real routed failure');
    },
    retry: false,
    meta: monitored ? { reportToSentry: true } : undefined,
  });

  return <div>{query.isError ? 'Query failed' : 'Query pending'}</div>;
}

describe('QueryProvider failure monitoring', () => {
  beforeEach(() => {
    queryClient.clear();
    monitoredFailureMock.mockClear();
    prefetchCriticalDataMock.mockClear();
  });

  afterEach(() => {
    queryClient.clear();
    vi.useRealTimers();
  });

  it('reports a real opted-in routed query failure', async () => {
    render(
      <QueryProvider>
        <FailingRoutedQuery monitored />
      </QueryProvider>
    );

    await screen.findByText('Query failed');

    await waitFor(() => {
      expect(monitoredFailureMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'real routed failure' }),
        ['provider-failure', true]
      );
    });
  });

  it('does not report an unmarked routed query failure', async () => {
    render(
      <QueryProvider>
        <FailingRoutedQuery monitored={false} />
      </QueryProvider>
    );

    await screen.findByText('Query failed');
    expect(monitoredFailureMock).not.toHaveBeenCalled();
  });

  it('prefetches startup data into the configured client', async () => {
    vi.useFakeTimers();
    render(<QueryProvider>Routed content</QueryProvider>);

    await vi.advanceTimersByTimeAsync(1000);

    expect(prefetchCriticalDataMock).toHaveBeenCalledWith(queryClient);
  });
});
