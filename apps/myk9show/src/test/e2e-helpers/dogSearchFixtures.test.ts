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

  it('preserves keyset pagination when a fixture lands in a full page', async () => {
    const { page, handlers } = createRouteRecorder();
    await installDogSearchFixtures(page, [RANGER_DOG_SEARCH_FIXTURE]);

    const handler = handlers.get('**/rest/v1/dogs**');
    if (!handler) throw new Error('Missing dog route handler');

    const realIds = Array.from(
      { length: 1001 },
      (_, index) => `dededede-0000-0000-0000-${String(index).padStart(12, '0')}`
    ).filter(id => id !== RANGER_DOG_SEARCH_FIXTURE.id);
    const realRows = realIds.map(id => ({ id }));

    const firstPage = createRouteDouble(
      'https://example.supabase.co/rest/v1/dogs?select=id&deleted_at=is.null&order=id.asc&limit=1000',
      realRows
    );
    await handler(firstPage.route);
    const firstIds = JSON.parse(firstPage.fulfilledBodies[0] ?? '[]').map(
      (row: { id: string }) => row.id
    );
    expect(firstIds).toHaveLength(1000);
    expect(firstIds).toContain(RANGER_DOG_SEARCH_FIXTURE.id);
    expect(new Set(firstIds).size).toBe(1000);

    const lastId = firstIds.at(-1);
    if (!lastId) throw new Error('Missing first-page cursor');
    const secondPage = createRouteDouble(
      `https://example.supabase.co/rest/v1/dogs?select=id&deleted_at=is.null&order=id.asc&limit=1000&id=gt.${lastId}`,
      realRows
    );
    await handler(secondPage.route);
    const secondIds = JSON.parse(secondPage.fulfilledBodies[0] ?? '[]').map(
      (row: { id: string }) => row.id
    );

    expect(secondIds).toEqual([realIds.at(-1)]);
    expect(firstIds).not.toContain(secondIds[0]);
    expect([...firstIds, ...secondIds].sort()).toEqual(
      [...realIds, RANGER_DOG_SEARCH_FIXTURE.id].sort()
    );
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

function createRouteDouble(url: string, rows: Array<{ id: string }> = [{ id: 'existing-dog' }]) {
  const fulfilledBodies: string[] = [];
  let fallbacks = 0;
  const route = {
    request: () => ({ method: () => 'GET', url: () => url }),
    fetch: async () => {
      const cursor = new URL(url).searchParams.get('id')?.replace(/^gt\./, '');
      const visibleRows = cursor ? rows.filter(row => row.id > cursor) : rows;
      return { json: async () => visibleRows.slice(0, 1000) };
    },
    fulfill: async ({ body }: { body?: string }) => {
      fulfilledBodies.push(body ?? '');
    },
    fallback: async () => {
      fallbacks += 1;
    },
  } as unknown as Route;

  return { route, fulfilledBodies, fallbackCount: () => fallbacks };
}
