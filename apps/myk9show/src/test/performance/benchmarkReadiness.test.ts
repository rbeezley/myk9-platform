import type { Page } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { waitForRouteReady } from './benchmarkReadiness';
import type { BenchmarkRoute } from './benchmarkRoutes';

const route: BenchmarkRoute = {
  id: 'setup',
  role: 'secretary',
  path: '/setup',
  readySelector: 'ready',
  unavailableSelectors: ['loading'],
};

describe('stable route readiness', () => {
  it('waits past an unavailable data state even when a heading is visible', async () => {
    let loadingPolls = 0;
    const page = {
      locator: (selector: string) => ({
        first: () => ({
          isVisible: async () => selector === 'ready' || ++loadingPolls < 3,
        }),
      }),
    } as unknown as Page;
    expect(await waitForRouteReady(page, route, 100, 0, 1)).toBeGreaterThan(0);
    expect(loadingPolls).toBeGreaterThanOrEqual(3);
  });
});
