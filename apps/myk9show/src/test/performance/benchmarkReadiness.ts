import type { Page } from '@playwright/test';
import type { BenchmarkRoute } from './benchmarkRoutes';

/** Require a stable content state so an early shell or transient empty state cannot end timing. */
export async function waitForRouteReady(
  page: Page,
  route: BenchmarkRoute,
  timeoutMs: number,
  stableMs = 300,
  pollMs = 100
): Promise<number> {
  const deadline = performance.now() + timeoutMs;
  let readySince: number | null = null;
  while (performance.now() < deadline) {
    const ready = await page
      .locator(route.readySelector)
      .first()
      .isVisible()
      .catch(() => false);
    const unavailable = await Promise.all(
      (route.unavailableSelectors ?? []).map(selector =>
        page
          .locator(selector)
          .first()
          .isVisible()
          .catch(() => false)
      )
    );
    const now = performance.now();
    if (ready && !unavailable.some(Boolean)) {
      readySince ??= now;
      if (now - readySince >= stableMs) return now;
    } else {
      readySince = null;
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  throw new Error(`Primary content did not reach a stable ready state within ${timeoutMs} ms`);
}
