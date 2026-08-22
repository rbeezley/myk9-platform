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
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { captureMonitoredQueryFailure } from '@/services/observability/sentry';

const SRC = resolve(__dirname, '../..');

vi.mock('@sentry/react', () => ({
  withScope: vi.fn((callback: (scope: unknown) => void) => {
    callback({ setTag: vi.fn(), setContext: vi.fn() });
  }),
  captureException: vi.fn(),
}));

describe('captureMonitoredQueryFailure', () => {
  it('reports a thrown Error as itself', async () => {
    const Sentry = await import('@sentry/react');
    const error = new Error('rpc is not a function');

    captureMonitoredQueryFailure(error, ['club-financial-reconciliation-orders', 'club-1']);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('wraps a non-Error throw rather than dropping it', async () => {
    // A `queryFn` can reject with anything. Sentry needs an Error to build a
    // stack from, and silently ignoring a string throw would recreate exactly
    // the invisibility this exists to end.
    const Sentry = await import('@sentry/react');
    vi.mocked(Sentry.captureException).mockClear();

    captureMonitoredQueryFailure('boom', ['club-financial-reconciliation-payouts', 'club-1']);

    const reported = vi.mocked(Sentry.captureException).mock.calls[0]?.[0];
    expect(reported).toBeInstanceOf(Error);
  });
});

describe('the reconciliation queries opt in', () => {
  // A source assertion is weak on its own — it proves someone typed the thing,
  // not that the thing works. It is paired here with the behavioral tests
  // above and the dispatch assertion below, and exists for the one property
  // neither can check: that BOTH reconciliation queries carry the flag. A
  // runtime test would need to drive the real QueryCache through two failing
  // network fetches to establish the same fact.
  const hook = readFileSync(
    resolve(SRC, 'features/financial/useClubFinancialReconciliation.ts'),
    'utf8'
  );

  it('marks both the orders and the payouts query', () => {
    expect(hook.match(/reportToSentry: true/g)).toHaveLength(2);
    expect(hook.match(/useQuery\(/g)).toHaveLength(2);
  });
});

describe('the global query-cache handler dispatches on the flag', () => {
  const client = readFileSync(resolve(SRC, 'lib/queryClient.ts'), 'utf8');

  it('calls the capture helper only for queries that opted in', () => {
    // Gated, not blanket: an offline-first app throws query errors routinely.
    expect(client).toMatch(/query\.meta\?\.reportToSentry/);
    expect(client).toMatch(/captureMonitoredQueryFailure\(error, query\.queryKey\)/);
  });
});
