import { expect, test, type Route } from '@playwright/test';
import { signInAsExhibitor, signInAsSecretary, TEST_USERS } from './helpers/testUsers';
import { loadEntryFixture, LOAD_SHOW_ID } from '../load/loadFixture';
import { waitForReplicatedEntry } from '../load/loadReplicationProbe';
import {
  installSharedStagingWriteGuard,
  type SharedStagingWriteLedgerEntry,
} from './helpers/sharedStagingWriteGuard';

// Opt-in, read-only diagnostic: never scores, checks in, reseeds, or changes settings.
// Keep separate from the full G9 entry point and its unchanged workload/thresholds.
test.skip(process.env.LOAD_READINESS_DIAGNOSTIC !== 'true', 'Explicit diagnostic opt-in required');
test.use({ trace: 'off', screenshot: 'off', video: 'off', serviceWorkers: 'block' });
test.setTimeout(45_000);

const fixture = loadEntryFixture(2);
const classPath = `/at-show/${LOAD_SHOW_ID}/class/${fixture.classId}`;
const surfaces = [
  { name: 'run-order dog cards', path: classPath, testId: 'dog-card' },
  {
    name: 'ringside submit button',
    path: `${classPath}/score/${fixture.entryId}`,
    testId: 'submit-btn',
  },
  { name: 'Show Desk', path: `/shows/${LOAD_SHOW_ID}/show-desk`, heading: 'Show Desk' },
  {
    name: 'My run schedule',
    path: `/shows/${LOAD_SHOW_ID}?tab=my-entries`,
    heading: 'My run schedule',
  },
];

for (const surface of surfaces) {
  test(`G9 single-session readiness: ${surface.name}`, async ({ page }, testInfo) => {
    const writeLedger: SharedStagingWriteLedgerEntry[] = [];
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true, ledger: writeLedger });
    const failures = new Map<string, number>();
    const requests = { api: 0, script: 0, other: 0 };
    const apiEndpoints = new Map<string, number>();
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith('/rest/v1/')) {
        requests.api += 1;
        // Paths only: never retain query parameters, credentials or payloads.
        apiEndpoints.set(pathname, (apiEndpoints.get(pathname) ?? 0) + 1);
      } else if (request.resourceType() === 'script') requests.script += 1;
      else requests.other += 1;
    });
    page.on('response', response => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith('/rest/v1/') || response.status() < 400) return;
      const key = `${response.status()} ${url.pathname}`;
      failures.set(key, (failures.get(key) ?? 0) + 1);
    });
    if (surface.name === 'My run schedule') {
      expect(TEST_USERS.DEMO_EXHIBITOR.email).toBe('exhibitor@myk9t.com');
      await signInAsExhibitor(page, '/shows');
    } else {
      expect(TEST_USERS.SECRETARY.email).toBe('secretary@myk9t.com');
      await signInAsSecretary(page, '/shows');
    }
    const started = performance.now();
    try {
      await page.goto(surface.path, { waitUntil: 'domcontentloaded' });
      if (surface.testId) {
        await expect(page.getByTestId(surface.testId).first()).toBeVisible({ timeout: 20_000 });
      } else {
        await expect(page.getByRole('heading', { name: surface.heading, exact: true })).toBeVisible(
          { timeout: 20_000 }
        );
      }
    } finally {
      const summary = {
        surface: surface.name,
        requests,
        writeLedger,
        apiEndpoints: [...apiEndpoints].map(([endpoint, count]) => ({ endpoint, count })),
        elapsedMs: Math.round(performance.now() - started),
        headings: [...new Set(await page.getByRole('heading').allTextContents())].slice(0, 8),
        failedEndpoints: [...failures].map(([endpoint, count]) => ({ endpoint, count })),
      };
      console.info(JSON.stringify(summary));
      await testInfo.attach('readiness-summary.json', {
        body: JSON.stringify(summary, null, 2),
        contentType: 'application/json',
      });
    }
  });
}

test('G9 cached scoresheet stays ready while replica requests stall', async ({ page }) => {
  await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
  expect(TEST_USERS.SECRETARY.email).toBe('secretary@myk9t.com');
  await signInAsSecretary(page, '/shows');
  await page.goto(classPath, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('dog-card').first()).toBeVisible({ timeout: 20_000 });
  await waitForReplicatedEntry(page, fixture.entryId, fixture.classId);

  const heldReads: Route[] = [];
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.split('/').at(-1);
    if (
      request.method() === 'GET' &&
      ['trials', 'classes', 'view_authenticated_entry_results'].includes(endpoint ?? '')
    ) {
      heldReads.push(route);
      return; // Deliberately unresolved until assertion/cleanup; no remote read.
    }
    await route.fallback();
  });
  try {
    await page.goto(`${classPath}/score/${fixture.entryId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('submit-btn')).toBeVisible({ timeout: 5_000 });
    await expect.poll(() => heldReads.length).toBeGreaterThan(0);
  } finally {
    await Promise.all(heldReads.map(route => route.abort().catch(() => undefined)));
  }
});
