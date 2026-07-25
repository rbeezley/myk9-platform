/**
 * Task 7.8 (runtime half) — console and network cleanliness across the
 * exhibitor journey.
 *
 * READ-ONLY. Navigates and observes.
 *
 * The static half of 7.8 (no new routes, no duplicate dashboards, no fake
 * metrics, no placeholder links, no stale locks) is a source audit, recorded in
 * the task commit rather than here. Horizontal clipping is covered exhaustively
 * by slice5-journey-matrix.spec.ts across 4 viewports x 2 themes. What is left
 * — and what only a running app can show — is whether the journey emits console
 * errors or leaves a failed request unhandled.
 *
 * "Unhandled mutation failure" is the one worth being precise about: a failing
 * READ is often legitimate (an optional resource, a probe), but a failing
 * WRITE that the UI does not surface leaves the user believing something saved
 * when it did not. So writes are held to a stricter standard than reads.
 *
 * Run pinned to its own port:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:5199 PLAYWRIGHT_PORT=5199 \
 *     pnpm playwright test src/test/e2e/slice5-runtime-cleanliness.spec.ts \
 *     --project=chromium --workers=1
 */
import { test, expect, type Page } from '@playwright/test';
import { signInAsTestUser } from './helpers/testUsers';

const SEED_DOG_ID = 'dededede-0000-0000-0000-000000000041';

const STOPS = [
  '/my-entries',
  `/dogs/${SEED_DOG_ID}`,
  `/dogs/${SEED_DOG_ID}?section=records&view=health`,
  `/dogs/${SEED_DOG_ID}?section=records&view=training`,
  `/dogs/${SEED_DOG_ID}?section=records&view=pedigree`,
  `/dogs/${SEED_DOG_ID}?section=career&view=titles`,
  `/dogs/${SEED_DOG_ID}?section=career&view=statistics`,
  '/exhibitor/payments',
  '/subscription',
  '/pricing-page',
] as const;

/**
 * Noise this app emits regardless of the flow under test. Kept deliberately
 * short and specific — a broad filter would hide the very errors this spec
 * exists to catch.
 */
const IGNORED_CONSOLE = /favicon|ResizeObserver loop|Download the React DevTools|\[vite\]/i;

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(400);
}

test.describe('Slice 5: runtime cleanliness', () => {
  test.setTimeout(300_000);

  test('journey emits no console errors and no unhandled write failures', async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedWrites: string[] = [];
    const failedReads: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error' && !IGNORED_CONSOLE.test(msg.text())) {
        consoleErrors.push(`${page.url()} :: ${msg.text()}`);
      }
    });
    page.on('pageerror', err => consoleErrors.push(`${page.url()} :: ${String(err)}`));

    page.on('response', res => {
      if (res.status() < 400) return;
      const method = res.request().method();
      const entry = `${method} ${res.status()} ${res.url().slice(0, 140)}`;
      if (method === 'GET' || method === 'HEAD') failedReads.push(entry);
      else failedWrites.push(entry);
    });

    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await page.setViewportSize({ width: 1280, height: 800 });

    for (const stop of STOPS) {
      await page.goto(stop);
      await settle(page);
    }

    // Reads are reported but not fatal — a 4xx on an optional resource is not
    // by itself a defect, and failing the suite on one would train people to
    // ignore it.
    if (failedReads.length > 0) {
      console.log(`[7.8] ${failedReads.length} failed read(s):\n  ${failedReads.join('\n  ')}`);
    }

    // Simply navigating the journey must issue no failing writes at all. One
    // here means the app attempted a mutation the user never asked for, and
    // that it failed.
    expect(
      failedWrites,
      `failed write(s) during a read-only journey walk:\n  ${failedWrites.join('\n  ')}`
    ).toHaveLength(0);

    expect(
      consoleErrors,
      `console errors during the journey walk:\n  ${consoleErrors.join('\n  ')}`
    ).toHaveLength(0);
  });
});
