/**
 * The guard patches `QueryCache.prototype.build`, a third-party global shared
 * by every QueryClient in the app and in the suite. What that buys — a
 * forgotten viewer scope failing rather than leaking — is asserted in
 * `viewerScopedQueryKey.test.ts`. What it RISKS is asserted here, because a
 * global patch has failure modes the feature tests cannot see:
 *
 * 1. Installed twice, a naive wrapper captures the first wrapper as its
 *    "original" and stacks. Never observable from a passing feature test.
 * 2. `build` runs inside render. In production this wrapper must swallow every
 *    error the check can raise — a guard that blanks a page is worse than the
 *    leak it was watching for.
 * 3. Keys outside the guarded namespaces must pass through untouched, on every
 *    client, or the patch has broken the rest of the app.
 */
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installViewerScopeGuard, isViewerScopeGuardInstalled } from './viewerScopeGuard';
import { MissingViewerScopeError, viewerScope } from './viewerScopedQueryKey';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('installViewerScopeGuard', () => {
  it('is already installed by the time any test runs', () => {
    // `test/setup.ts` imports the module for its side effect. If this ever
    // fails, every AC3 assertion in the suite is vacuous.
    expect(isViewerScopeGuardInstalled()).toBe(true);
  });

  it('is idempotent — a second install does not stack another wrapper', () => {
    const installed = QueryCache.prototype.build;

    installViewerScopeGuard();
    installViewerScopeGuard();

    expect(QueryCache.prototype.build).toBe(installed);
  });

  it('leaves the wrapper working after a repeat install', () => {
    installViewerScopeGuard();
    const client = new QueryClient();

    expect(() =>
      client.getQueryCache().build(client, { queryKey: ['exhibitor', 'repeat-install'] })
    ).toThrow(MissingViewerScopeError);

    client.clear();
  });
});

describe('the production path', () => {
  it('reports an unscoped key instead of throwing, and still builds the query', () => {
    vi.stubEnv('PROD', true);
    const client = new QueryClient();

    const query = client.getQueryCache().build(client, {
      queryKey: ['exhibitor', 'unscoped-in-production'],
    });

    // Continuing is the point: `build` runs inside render, so a throw here is a
    // blank page. The cache clear on account change is the standing defence.
    expect(query.queryKey).toEqual(['exhibitor', 'unscoped-in-production']);
    client.clear();
  });

  it('does not throw even when the key cannot be serialised for the message', () => {
    // A BigInt segment makes `JSON.stringify` throw. React Query permits it
    // when the query overrides `queryKeyHashFn`, so this reaches `build` for
    // real — and it is NOT a MissingViewerScopeError, which is why production
    // swallows everything rather than only the error it expects.
    vi.stubEnv('PROD', true);
    const client = new QueryClient();
    const queryKey = ['exhibitor', 'unserialisable', 1n];

    expect(() =>
      client.getQueryCache().build(client, { queryKey, queryKeyHashFn: () => 'stable-hash' })
    ).not.toThrow();

    client.clear();
  });

  it('swallows an error the check itself did not expect', () => {
    // The property is "production swallows EVERYTHING the check can raise",
    // which cannot be asserted with an error class the guard knows about. So
    // the key itself is made hostile: reading index 1 throws a plain Error from
    // inside `isViewerScopedQueryKey`'s own `.some()`. Nothing the guard
    // matches on, arriving from exactly where an unforeseen bug would.
    vi.stubEnv('PROD', true);
    const client = new QueryClient();
    const queryKey: unknown[] = ['exhibitor'];
    Object.defineProperty(queryKey, 1, {
      enumerable: true,
      get() {
        throw new Error('hostile query key segment');
      },
    });

    expect(() =>
      client.getQueryCache().build(client, { queryKey, queryKeyHashFn: () => 'hostile-hash' })
    ).not.toThrow();

    client.clear();
  });

  it('still throws that same key outside production, so a real bug stays loud', () => {
    const client = new QueryClient();

    expect(() =>
      client.getQueryCache().build(client, {
        queryKey: ['exhibitor', 'unserialisable', 1n],
        queryKeyHashFn: () => 'stable-hash-dev',
      })
    ).toThrow(MissingViewerScopeError);

    client.clear();
  });
});

describe('the rest of the app', () => {
  it('runs an ordinary query on a patched client end to end', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const data = await client.fetchQuery({
      queryKey: ['shows', 'list'],
      queryFn: async () => ['show-1'],
    });

    expect(data).toEqual(['show-1']);
    client.clear();
  });

  it('runs a correctly scoped exhibitor query end to end', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const data = await client.fetchQuery({
      queryKey: ['exhibitor', 'my-payments', viewerScope('viewer-1'), 'all'],
      queryFn: async () => ['pi_viewer_1'],
    });

    expect(data).toEqual(['pi_viewer_1']);
    client.clear();
  });
});
