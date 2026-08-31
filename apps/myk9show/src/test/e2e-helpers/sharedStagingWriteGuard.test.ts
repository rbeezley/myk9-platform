import type { Page, Route } from '@playwright/test';
import { describe, expect, it } from 'vitest';

import {
  AUDIT_INTERCEPTED_WRITE_RPCS,
  AUDIT_READ_ONLY_RPCS,
  classifySharedStagingWrite,
  installSharedStagingWriteGuard,
  isObservableIsolatedRingsideWrite,
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

  // The assertion that matters is the DEFAULT. An earlier version of this test
  // passed `observeIsolatedRingsideWrites: true` and proved only that the
  // capability existed when asked for — which stayed green for seven weeks
  // while every atShowJudgeScoring spec, none of which passed the flag, saw an
  // empty `ringsideRpcCalls` against the isolated target. Pass NO options here.
  it('observes an isolated-target RPC without intercepting the write, with no flag', async () => {
    const { page, handlers } = createRouteRecorder();
    const ringsideRpcCalls: GuardedRingsideRpcCall[] = [];
    await installSharedStagingWriteGuard(page, {
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

describe('isObservableIsolatedRingsideWrite', () => {
  // Known-answer checks for the host gate that caused MYK9-270. If someone
  // narrows observation back to the shared-staging host, these fail loudly
  // instead of quietly emptying every spec's `ringsideRpcCalls`.
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321'])(
    'observes a ringside write to the isolated target at %s',
    origin => {
      expect(
        isObservableIsolatedRingsideWrite({
          method: 'POST',
          url: `${origin}/rest/v1/rpc/ringside_update_entry`,
        })
      ).toBe(true);
    }
  );

  it('does NOT treat a shared-staging ringside write as isolated', () => {
    // Shared staging takes the interception path instead, which answers the
    // call locally so the write never reaches the real project.
    expect(
      isObservableIsolatedRingsideWrite({
        method: 'POST',
        url: `${sharedBaseUrl}/rest/v1/rpc/ringside_update_entry`,
      })
    ).toBe(false);
  });

  it('does NOT observe a different RPC on the isolated target', () => {
    expect(
      isObservableIsolatedRingsideWrite({
        method: 'POST',
        url: 'http://127.0.0.1:54321/rest/v1/rpc/self_checkin_entry',
      })
    ).toBe(false);
  });

  it('does NOT observe a GET to the ringside RPC path', () => {
    expect(
      isObservableIsolatedRingsideWrite({
        method: 'GET',
        url: 'http://127.0.0.1:54321/rest/v1/rpc/ringside_update_entry',
      })
    ).toBe(false);
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

    const unknownWriter = createRouteDouble({
      method: 'POST',
      url: `${sharedBaseUrl}/rest/v1/rpc/self_checkin_entry`,
    });
    await getHandler(handlers, '**/rest/v1/**')(unknownWriter.route);

    expect(unknownWriter.abortCount()).toBe(1);
    expect(summarizeSharedStagingWriteLedger(ledger).blocked).toHaveLength(1);
  });

  it.each([...AUDIT_INTERCEPTED_WRITE_RPCS])(
    'answers the %s presence write locally instead of failing the run',
    async rpc => {
      // Heartbeat traffic is a real write, but it is ambient and not part of the
      // journey under audit. Blocking it would abort the run over something the
      // replay never asked for; intercepting keeps staging clean either way.
      const { page, handlers } = createRouteRecorder();
      const ledger: SharedStagingWriteLedgerEntry[] = [];
      await installSharedStagingWriteGuard(page, { ledger, strictRpcWrites: true });

      const presence = createRouteDouble({
        method: 'POST',
        url: `${sharedBaseUrl}/rest/v1/rpc/${rpc}`,
      });
      await getHandler(handlers, '**/rest/v1/**')(presence.route);

      expect(presence.abortCount()).toBe(0);
      expect(presence.fallbackCount()).toBe(0);
      expect(presence.fulfilledStatuses).toEqual([200]);
      expect(summarizeSharedStagingWriteLedger(ledger)).toMatchObject({
        intercepted: 1,
        blocked: [],
      });
    }
  );

  it('does not intercept presence writes when strictRpcWrites is off', async () => {
    const { page, handlers } = createRouteRecorder();
    const ledger: SharedStagingWriteLedgerEntry[] = [];
    await installSharedStagingWriteGuard(page, { ledger });

    const presence = createRouteDouble({
      method: 'POST',
      url: `${sharedBaseUrl}/rest/v1/rpc/upsert_ringside_session`,
    });
    await getHandler(handlers, '**/rest/v1/**')(presence.route);

    expect(presence.fallbackCount()).toBe(1);
    expect(ledger).toEqual([]);
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
