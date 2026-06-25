import type { Page, Route } from '@playwright/test';
import { describe, expect, it } from 'vitest';

import {
  classifySharedStagingWrite,
  installSharedStagingWriteGuard,
  SHARED_STAGING_PROJECT_REF,
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
  const route = {
    request: () =>
      ({
        method: () => method,
        url: () => url,
        postDataJSON: () => ({ p_entry_id: 'entry-1', p_fields: { is_scored: true } }),
      }) as unknown,
    fulfill: async (response: { body?: string }) => {
      fulfilledBodies.push(response.body ?? '');
    },
    fallback: async () => undefined,
  } as unknown as Route;

  return { route, fulfilledBodies };
}
