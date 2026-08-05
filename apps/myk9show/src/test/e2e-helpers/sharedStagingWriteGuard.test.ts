import type { Page, Route } from '@playwright/test';
import { describe, expect, it } from 'vitest';

import {
  AUDIT_READ_ONLY_RPCS,
  classifySharedStagingWrite,
  installSharedStagingWriteGuard,
  isUnambiguousSharedStagingRestWrite,
  SHARED_STAGING_PROJECT_REF,
  summarizeSharedStagingWriteLedger,
  type GuardedRingsideRpcCall,
  type SharedStagingWriteLedgerEntry,
} from '../e2e/helpers/sharedStagingWriteGuard';

const sharedBaseUrl = `https://${SHARED_STAGING_PROJECT_REF}.supabase.co`;
type RouteHandler = (route: Route) => Promise<void> | void;

describe('classifySharedStagingWrite', () => {
  it('intercepts ringside scoring RPC writes to shared staging', () => {
    expect(
      classifySharedStagingWrite({
        method: 'POST',
        url: `${sharedBaseUrl}/rest/v1/rpc/ringside_update_entry`,
      })
    ).toEqual({ kind: 'ringside-update-entry-rpc' });
  });

  it('intercepts direct entry patches to shared staging', () => {
    expect(
      classifySharedStagingWrite({
        method: 'PATCH',
        url: `${sharedBaseUrl}/rest/v1/entries?id=eq.entry-123`,
      })
    ).toEqual({ kind: 'entries-patch' });
  });

  it('does not intercept read requests to shared staging', () => {
    expect(
      classifySharedStagingWrite({
        method: 'GET',
        url: `${sharedBaseUrl}/rest/v1/entries?id=eq.entry-123`,
      })
    ).toBeNull();
  });

  it('does not intercept writes to an isolated Supabase project', () => {
    expect(
      classifySharedStagingWrite({
        method: 'POST',
        url: 'https://isolated-e2e-project.supabase.co/rest/v1/rpc/ringside_update_entry',
      })
    ).toBeNull();
  });
});

describe('installSharedStagingWriteGuard', () => {
  it('increments fixture RPC versions even when no collector is provided', async () => {
    const { page, handlers } = createRouteRecorder();
    await installSharedStagingWriteGuard(page, { versionBase: 200 });

    const firstRoute = createRouteDouble({
      method: 'POST',
      url: `${sharedBaseUrl}/rest/v1/rpc/ringside_update_entry`,
    });
    const secondRoute = createRouteDouble({
      method: 'POST',
      url: `${sharedBaseUrl}/rest/v1/rpc/ringside_update_entry`,
    });

    const handler = getHandler(handlers, '**/rest/v1/rpc/ringside_update_entry');
    await handler(firstRoute.route);
    await handler(secondRoute.route);

    expect(firstRoute.fulfilledBodies).toEqual(['201']);
    expect(secondRoute.fulfilledBodies).toEqual(['202']);
  });

  it('can observe an isolated-target RPC without intercepting the write', async () => {
    const { page, handlers } = createRouteRecorder();
    const ringsideRpcCalls: GuardedRingsideRpcCall[] = [];
    await installSharedStagingWriteGuard(page, {
      observeIsolatedRingsideWrites: true,
      ringsideRpcCalls,
    });

    const isolatedRoute = createRouteDouble({
      method: 'POST',
      url: 'http://127.0.0.1:54321/rest/v1/rpc/ringside_update_entry',
    });

    const handler = getHandler(handlers, '**/rest/v1/rpc/ringside_update_entry');
    await handler(isolatedRoute.route);

    expect(isolatedRoute.fulfilledBodies).toEqual([]);
    expect(isolatedRoute.fallbackCount()).toBe(1);
    expect(ringsideRpcCalls).toEqual([{ p_entry_id: 'entry-1', p_fields: { is_scored: true } }]);
  });
});

describe('isUnambiguousSharedStagingRestWrite', () => {
  it.each(['PATCH', 'PUT', 'DELETE'])('treats %s on shared staging as a write', method => {
    expect(
      isUnambiguousSharedStagingRestWrite({ method, url: `${sharedBaseUrl}/rest/v1/dogs?id=eq.1` })
    ).toBe(true);
  });

  it('treats a POST to a table path as a write', () => {
    expect(
      isUnambiguousSharedStagingRestWrite({ method: 'POST', url: `${sharedBaseUrl}/rest/v1/dogs` })
    ).toBe(true);
  });

  it('does NOT treat a POST to an RPC as a write by default', () => {
    // An RPC POST is opaque. Existing specs make no "nothing was forwarded"
    // claim, so they keep the permissive behaviour.
    expect(
      isUnambiguousSharedStagingRestWrite({
        method: 'POST',
        url: `${sharedBaseUrl}/rest/v1/rpc/upsert_ringside_session`,
      })
    ).toBe(false);
  });

  it('treats an RPC POST outside the read-only allowlist as a write under strictRpc', () => {
    // This is the case Codex flagged: a genuine writer that would otherwise
    // reach shared staging while the audit still reported "no writes".
    expect(
      isUnambiguousSharedStagingRestWrite(
        { method: 'POST', url: `${sharedBaseUrl}/rest/v1/rpc/upsert_ringside_session` },
        { strictRpc: true }
      )
    ).toBe(true);
  });

  it.each([...AUDIT_READ_ONLY_RPCS])('lets read-only RPC %s through under strictRpc', rpc => {
    expect(
      isUnambiguousSharedStagingRestWrite(
        { method: 'POST', url: `${sharedBaseUrl}/rest/v1/rpc/${rpc}` },
        { strictRpc: true }
      )
    ).toBe(false);
  });

  it('leaves ringside_update_entry to its own dedicated handler', () => {
    expect(
      isUnambiguousSharedStagingRestWrite(
        { method: 'POST', url: `${sharedBaseUrl}/rest/v1/rpc/ringside_update_entry` },
        { strictRpc: true }
      )
    ).toBe(false);
  });

  it('ignores reads, other hosts, and non-REST paths', () => {
    expect(
      isUnambiguousSharedStagingRestWrite({ method: 'GET', url: `${sharedBaseUrl}/rest/v1/dogs` })
    ).toBe(false);
    expect(
      isUnambiguousSharedStagingRestWrite({
        method: 'POST',
        url: `${sharedBaseUrl}/auth/v1/token`,
      })
    ).toBe(false);
    expect(
      isUnambiguousSharedStagingRestWrite({
        method: 'PATCH',
        url: 'https://isolated-e2e-project.supabase.co/rest/v1/dogs',
      })
    ).toBe(false);
  });
});

describe('the write ledger', () => {
  it('records an intercepted ringside RPC as intercepted, not blocked', async () => {
    const { page, handlers } = createRouteRecorder();
    const ledger: SharedStagingWriteLedgerEntry[] = [];
    await installSharedStagingWriteGuard(page, { ledger });

    const handler = getHandler(handlers, '**/rest/v1/rpc/ringside_update_entry');
    await handler(
      createRouteDouble({
        method: 'POST',
        url: `${sharedBaseUrl}/rest/v1/rpc/ringside_update_entry`,
      }).route
    );

    expect(ledger).toEqual([
      {
        kind: 'ringside-update-entry-rpc',
        method: 'POST',
        path: '/rest/v1/rpc/ringside_update_entry',
        disposition: 'intercepted',
      },
    ]);
    expect(summarizeSharedStagingWriteLedger(ledger)).toEqual({
      total: 1,
      intercepted: 1,
      blocked: [],
    });
  });

  it('blocks and records an unrecognised shared-staging write', async () => {
    const { page, handlers } = createRouteRecorder();
    const ledger: SharedStagingWriteLedgerEntry[] = [];
    await installSharedStagingWriteGuard(page, { ledger });

    const unknownWrite = createRouteDouble({
      method: 'DELETE',
      url: `${sharedBaseUrl}/rest/v1/dogs?id=eq.1`,
    });
    await getHandler(handlers, '**/rest/v1/**')(unknownWrite.route);

    expect(unknownWrite.abortCount()).toBe(1);
    expect(unknownWrite.fallbackCount()).toBe(0);
    expect(summarizeSharedStagingWriteLedger(ledger).blocked).toEqual([
      {
        kind: 'unclassified-rest-write',
        method: 'DELETE',
        path: '/rest/v1/dogs',
        disposition: 'blocked',
      },
    ]);
  });

  it('blocks and records an unknown mutating RPC when strictRpcWrites is on', async () => {
    const { page, handlers } = createRouteRecorder();
    const ledger: SharedStagingWriteLedgerEntry[] = [];
    await installSharedStagingWriteGuard(page, { ledger, strictRpcWrites: true });

    const sessionWrite = createRouteDouble({
      method: 'POST',
      url: `${sharedBaseUrl}/rest/v1/rpc/upsert_ringside_session`,
    });
    await getHandler(handlers, '**/rest/v1/**')(sessionWrite.route);

    expect(sessionWrite.abortCount()).toBe(1);
    expect(summarizeSharedStagingWriteLedger(ledger).blocked).toHaveLength(1);
  });

  it('lets reads through the catch-all untouched', async () => {
    const { page, handlers } = createRouteRecorder();
    const ledger: SharedStagingWriteLedgerEntry[] = [];
    await installSharedStagingWriteGuard(page, { ledger });

    const read = createRouteDouble({ method: 'GET', url: `${sharedBaseUrl}/rest/v1/dogs` });
    await getHandler(handlers, '**/rest/v1/**')(read.route);

    expect(read.fallbackCount()).toBe(1);
    expect(read.abortCount()).toBe(0);
    expect(ledger).toEqual([]);
  });
});

describe('conflict injection', () => {
  it('rejects only the matching call, then answers normally', async () => {
    const { page, handlers } = createRouteRecorder();
    await installSharedStagingWriteGuard(page, {
      versionBase: 100,
      conflictResponses: 1,
      conflictMatcher: call => call.p_fields?.is_scored === true,
      conflictServerVersion: 4242,
    });

    const handler = getHandler(handlers, '**/rest/v1/rpc/ringside_update_entry');
    const scored = createRouteDouble({
      method: 'POST',
      url: `${sharedBaseUrl}/rest/v1/rpc/ringside_update_entry`,
    });
    const retry = createRouteDouble({
      method: 'POST',
      url: `${sharedBaseUrl}/rest/v1/rpc/ringside_update_entry`,
    });

    await handler(scored.route);
    await handler(retry.route);

    expect(scored.fulfilledStatuses).toEqual([409]);
    expect(JSON.parse(scored.fulfilledBodies[0])).toMatchObject({
      code: '40001',
      details: '4242',
    });
    // The budget is spent; the retry succeeds.
    expect(retry.fulfilledStatuses).toEqual([200]);
  });

  it('does not spend the conflict budget on a non-matching call', async () => {
    const { page, handlers } = createRouteRecorder();
    await installSharedStagingWriteGuard(page, {
      conflictResponses: 1,
      // Scoring a dog also emits check-in/check-out writes; those must pass
      // through so the injected conflict lands on the score itself.
      conflictMatcher: call => call.p_fields?.result_status === 'qualified',
    });

    const handler = getHandler(handlers, '**/rest/v1/rpc/ringside_update_entry');
    const checkIn = createRouteDouble({
      method: 'POST',
      url: `${sharedBaseUrl}/rest/v1/rpc/ringside_update_entry`,
    });
    await handler(checkIn.route);

    expect(checkIn.fulfilledStatuses).toEqual([200]);
  });
});

function createRouteRecorder() {
  const handlers = new Map<string, RouteHandler>();
  const page = {
    route: async (url: string, handler: RouteHandler) => {
      handlers.set(url, handler);
    },
  } as unknown as Page;

  return { page, handlers };
}

function getHandler(handlers: Map<string, RouteHandler>, url: string) {
  const handler = handlers.get(url);
  if (!handler) {
    throw new Error(`Missing route handler for ${url}`);
  }
  return handler;
}

function createRouteDouble({ method, url }: { method: string; url: string }) {
  const fulfilledBodies: string[] = [];
  const fulfilledStatuses: number[] = [];
  let fallbacks = 0;
  let aborts = 0;
  const route = {
    request: () =>
      ({
        method: () => method,
        url: () => url,
        postDataJSON: () => ({ p_entry_id: 'entry-1', p_fields: { is_scored: true } }),
      }) as unknown,
    fulfill: async (response: { body?: string; status?: number }) => {
      fulfilledBodies.push(response.body ?? '');
      fulfilledStatuses.push(response.status ?? 200);
    },
    fallback: async () => {
      fallbacks += 1;
    },
    abort: async () => {
      aborts += 1;
    },
  } as unknown as Route;

  return {
    route,
    fulfilledBodies,
    fulfilledStatuses,
    fallbackCount: () => fallbacks,
    abortCount: () => aborts,
  };
}
