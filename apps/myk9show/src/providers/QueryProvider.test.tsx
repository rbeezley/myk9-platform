import { useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { captureMonitoredQueryFailure } from '@/services/observability/sentry';
import { getAllShows } from '@/services/database/shows';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { queryClient } from '@/lib/queryClient';
import { QueryProvider } from './QueryProvider';

vi.mock('@/services/observability/sentry', () => ({
  captureMonitoredQueryFailure: vi.fn(),
}));
vi.mock('@/services/database/shows', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/shows')>()),
  getAllShows: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

const monitoredFailureMock = vi.mocked(captureMonitoredQueryFailure);
const getAllShowsMock = vi.mocked(getAllShows);

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
    getAllShowsMock.mockClear();
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

  // MYK9-1359: the boot prefetch read every show with its clubs, trials, classes
  // and judge assignments one second after mount on every route, including
  // /at-show on a cold device. QueryProvider wraps the whole app (main.tsx), so
  // this is the app-wide boot behaviour.
  it('issues no shows read on boot, past the old 1 s prefetch delay', async () => {
    vi.useFakeTimers();
    render(<QueryProvider>Routed content</QueryProvider>);

    await vi.advanceTimersByTimeAsync(2000);

    expect(getAllShowsMock).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().findAll({ queryKey: showQueryKeys.lists() })).toEqual([]);
  });
});
