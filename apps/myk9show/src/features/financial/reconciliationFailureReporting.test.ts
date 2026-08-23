/**
 * MYK9-231, fourth criterion — the decision on whether reconciliation fetch
 * failures report to Sentry, made and pinned.
 *
 * DECISION: yes, opt-in per query via `meta.reportToSentry`, dispatched from the
 * global `QueryCache.onError`.
 *
 * WHY IT NEEDED DECIDING. React Query catches a throwing `queryFn` into
 * `isError` and stops. The #1727 outage — a detached-method `TypeError` that
 * threw synchronously in the browser, before any request was issued — produced
 * no console error, no failed request, and nothing in Postgres, edge or RPC
 * logs. Every financial surface sat in its unavailable state and the only way
 * to find the cause was to read the live React Query cache in a browser
 * session. `logger.error` in the cache handler does not reach Sentry
 * (`frontend_logs` has no writer), so it did not help.
 *
 * WHY OPT-IN AND NOT EVERY QUERY. This is an offline-first app; most query
 * failures are ordinary connectivity and reporting them all would bury the ones
 * that matter. Money surfaces opt in.
 *
 * WHY THIS FILE DRIVES A REAL QueryClient. The first version of these tests
 * called the capture helper directly and asserted the wiring with source greps.
 * Review killed it in one move: deleting `queryCache` from the `new
 * QueryClient({...})` literal disconnects the entire feature, and every grep
 * still matched, so 545 tests passed with the observability dead. A test of
 * this has to fail a query through the real client.
 */
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { captureMonitoredQueryFailure } from '@/services/observability/sentry';
import { queryClient } from '@/lib/queryClient';

const SRC = resolve(__dirname, '../..');

vi.mock('@sentry/react', () => ({
  withScope: vi.fn((callback: (scope: unknown) => void) => {
    callback({ setTag: vi.fn(), setContext: vi.fn() });
  }),
  captureException: vi.fn(),
}));

async function sentryMock() {
  const Sentry = await import('@sentry/react');
  return vi.mocked(Sentry.captureException);
}

beforeEach(async () => {
  (await sentryMock()).mockClear();
});

describe('captureMonitoredQueryFailure', () => {
  it('reports a thrown Error as itself', async () => {
    const captureException = await sentryMock();
    const error = new Error('rpc is not a function');

    captureMonitoredQueryFailure(error, ['club-financial-reconciliation-orders', 'club-1']);

    expect(captureException).toHaveBeenCalledWith(error);
  });

  it('wraps a non-Error throw rather than dropping it', async () => {
    // A `queryFn` can reject with anything. Sentry needs an Error to build a
    // stack from, and silently ignoring a string throw would recreate exactly
    // the invisibility this exists to end.
    const captureException = await sentryMock();

    captureMonitoredQueryFailure('boom', ['club-financial-reconciliation-payouts', 'club-1']);

    expect(captureException.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});

describe('the exported queryClient actually dispatches on failure', () => {
  /** Fail a query through a real client and let the cache handler run. */
  async function failQuery(client: QueryClient, meta?: Record<string, unknown>) {
    await client
      .fetchQuery({
        queryKey: ['club-financial-reconciliation-orders', 'club-1'],
        queryFn: () => Promise.reject(new Error('rpc is not a function')),
        retry: false,
        ...(meta ? { meta } : {}),
      })
      .catch(() => undefined);
  }

  it('reports a flagged query that fails', async () => {
    // This is the assertion the source greps could not make: the app's OWN
    // exported client — the one main.tsx hands to the provider — must carry a
    // cache whose handler fires. Detaching the cache from the client makes this
    // fail, which is the mutation that previously survived.
    const captureException = await sentryMock();

    await failQuery(queryClient, { reportToSentry: true });

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('stays silent for a query that did not opt in', async () => {
    // Blanket reporting would bury the signal on an offline-first app.
    const captureException = await sentryMock();

    await failQuery(queryClient);

    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports once per settled failure, not once per retry attempt', async () => {
    // QueryCache.onError runs after the retryer rejects, so retries must not
    // multiply the report. Asserted rather than trusted: getting this wrong is
    // a cost and noise bug that no other test would notice.
    const captureException = await sentryMock();
    let attempts = 0;
    const client = new QueryClient({ queryCache: new QueryCache(queryCacheHandlers()) });

    await client
      .fetchQuery({
        queryKey: ['club-financial-reconciliation-orders', 'retrying'],
        queryFn: () => {
          attempts += 1;
          return Promise.reject(new Error('flaky'));
        },
        retry: 2,
        retryDelay: 0,
        meta: { reportToSentry: true },
      })
      .catch(() => undefined);

    expect(attempts).toBe(3);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  /** The same handler shape the app installs, so the retry assertion tests the
   *  real dispatch rule rather than a local invention. */
  function queryCacheHandlers() {
    return {
      onError: (
        error: unknown,
        query: { meta?: Record<string, unknown>; queryKey: readonly unknown[] }
      ) => {
        if (query.meta?.reportToSentry) captureMonitoredQueryFailure(error, query.queryKey);
      },
    };
  }
});

describe('every reconciliation surface opts in', () => {
  // Source assertions, and honestly labelled as such: they cannot prove the
  // dispatch works — the tests above do that against the real client. What they
  // add is COVERAGE across call sites, which a behavioural test would only get
  // by driving each surface's whole fetch stack. #1727 blinded club AND
  // site-admin together, so a fix that reaches only one of them is the
  // regression worth guarding.
  const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

  it('marks both club reconciliation queries', () => {
    const hook = read('features/financial/useClubFinancialReconciliation.ts');
    expect(hook.match(/reportToSentry: true/g)).toHaveLength(2);
    expect(hook.match(/useQuery\(/g)).toHaveLength(2);
  });

  it('marks the site-admin overview query', () => {
    const hook = read('features/financial/components/usePlatformFinancialOverview.ts');
    expect(hook.match(/reportToSentry: true/g)).toHaveLength(1);
    expect(hook.match(/useQuery\(/g)).toHaveLength(1);
  });
});
