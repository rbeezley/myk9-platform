import type { Page, Route } from '@playwright/test';
import { describe, expect, it } from 'vitest';

import {
  installDogSearchFixtures,
  RANGER_DOG_SEARCH_FIXTURE,
} from '../e2e/registration/dogSearchFixtures';

type RouteHandler = (route: Route) => Promise<void> | void;

describe('installDogSearchFixtures', () => {
  it('only augments the exact reconciliation read, not owner-specific dog reads', async () => {
    const { page, handlers } = createRouteRecorder();
    await installDogSearchFixtures(page, [RANGER_DOG_SEARCH_FIXTURE]);

    const handler = handlers.get('**/rest/v1/dogs**');
    if (!handler) throw new Error('Missing dog route handler');

    const ownerRead = createRouteDouble(
      'https://example.supabase.co/rest/v1/dogs?select=id%2Ccall_name%2Cname&deleted_at=is.null&owner_id=eq.owner-1'
    );
    await handler(ownerRead.route);
    expect(ownerRead.fallbackCount()).toBe(1);
    expect(ownerRead.fulfilledBodies).toEqual([]);

    const reconciliationRead = createRouteDouble(
      'https://example.supabase.co/rest/v1/dogs?select=id&deleted_at=is.null&order=id.asc&limit=1000'
    );
    await handler(reconciliationRead.route);
    expect(reconciliationRead.fallbackCount()).toBe(0);
    expect(reconciliationRead.fulfilledBodies[0]).toContain(RANGER_DOG_SEARCH_FIXTURE.id);
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

function createRouteDouble(url: string) {
  const fulfilledBodies: string[] = [];
  let fallbacks = 0;
  const route = {
    request: () => ({ method: () => 'GET', url: () => url }),
    fetch: async () => ({ json: async () => [{ id: 'existing-dog' }] }),
    fulfill: async ({ body }: { body?: string }) => {
      fulfilledBodies.push(body ?? '');
    },
    fallback: async () => {
      fallbacks += 1;
    },
  } as unknown as Route;

  return { route, fulfilledBodies, fallbackCount: () => fallbacks };
}
