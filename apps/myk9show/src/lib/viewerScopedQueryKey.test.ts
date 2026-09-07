/**
 * MYK9-429 AC3: a NEW query key in a viewer-scoped namespace that forgets its
 * viewer must FAIL, not be quietly permitted.
 *
 * The keys we already own are covered by their own hooks' tests. What is tested
 * here is the thing that catches the key nobody has written yet, so these cases
 * deliberately invent namespace keys that appear nowhere in the app.
 */
import { QueryClient } from '@tanstack/react-query';
import {
  MissingViewerScopeError,
  assertViewerScopedQueryKey,
  isViewerScopedQueryKey,
  requiresViewerScope,
  viewerScope,
} from './viewerScopedQueryKey';

describe('viewerScope', () => {
  it('marks the viewer so it cannot be mistaken for an ordinary key segment', () => {
    expect(viewerScope('viewer-1')).toEqual({ viewerScope: 'viewer-1' });
    // A plain string segment is exactly what is NOT recognisable: this is why
    // the marker exists at all.
    expect(isViewerScopedQueryKey(['exhibitor', 'my-payments', 'viewer-1'])).toBe(false);
    expect(isViewerScopedQueryKey(['exhibitor', 'my-payments', viewerScope('viewer-1')])).toBe(
      true
    );
  });

  it('records a signed-out viewer as null rather than dropping the segment', () => {
    expect(viewerScope(null)).toEqual({ viewerScope: null });
    expect(viewerScope(undefined)).toEqual({ viewerScope: null });
    expect(isViewerScopedQueryKey(['exhibitor', 'thing', viewerScope(null)])).toBe(true);
  });

  it('gives two viewers different key hashes for the same request', () => {
    const client = new QueryClient();
    const hashOf = (viewerId: string) =>
      client.getQueryCache().build(client, {
        queryKey: ['exhibitor', 'my-payments', viewerScope(viewerId), 'all'],
      }).queryHash;

    expect(hashOf('viewer-1')).not.toBe(hashOf('viewer-2'));
    client.clear();
  });
});

describe('assertViewerScopedQueryKey', () => {
  it('rejects an unscoped key in a viewer-scoped namespace', () => {
    expect(() => assertViewerScopedQueryKey(['exhibitor', 'brand-new-thing'])).toThrow(
      MissingViewerScopeError
    );
  });

  it('accepts the same key once it carries its viewer', () => {
    expect(() =>
      assertViewerScopedQueryKey(['exhibitor', 'brand-new-thing', viewerScope('viewer-1')])
    ).not.toThrow();
  });

  it('leaves keys outside the viewer-scoped namespaces alone', () => {
    expect(requiresViewerScope(['shows', 'list'])).toBe(false);
    expect(() => assertViewerScopedQueryKey(['shows', 'list'])).not.toThrow();
  });
});

describe('the installed guard', () => {
  // `test/setup.ts` imports `@/lib/viewerScopeGuard`, so the check is live for
  // every QueryClient a test builds — which is the point: a new unscoped key
  // has to redden the suite, not only the browser.
  it('throws when any QueryClient builds an unscoped exhibitor key', () => {
    const client = new QueryClient();
    expect(() =>
      client.getQueryCache().build(client, { queryKey: ['exhibitor', 'brand-new-thing'] })
    ).toThrow(MissingViewerScopeError);
    client.clear();
  });

  it('lets a scoped key through and still builds a working query', () => {
    const client = new QueryClient();
    const query = client.getQueryCache().build(client, {
      queryKey: ['exhibitor', 'brand-new-thing', viewerScope('viewer-1')],
    });
    expect(query.queryKey).toEqual(['exhibitor', 'brand-new-thing', { viewerScope: 'viewer-1' }]);
    client.clear();
  });

  it('does not interfere with keys outside the guarded namespaces', () => {
    const client = new QueryClient();
    expect(() => client.getQueryCache().build(client, { queryKey: ['shows', 'list'] })).not.toThrow(
      MissingViewerScopeError
    );
    client.clear();
  });
});
