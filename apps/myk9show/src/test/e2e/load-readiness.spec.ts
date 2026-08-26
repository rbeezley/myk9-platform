import { expect, test } from '@playwright/test';
import { signInAsExhibitor, signInAsSecretary, TEST_USERS } from './helpers/testUsers';
import { loadEntryFixture, LOAD_SHOW_ID } from '../load/loadFixture';

// Opt-in, read-only diagnostic: never scores, checks in, reseeds, or changes settings.
// Keep separate from the full G9 entry point and its unchanged workload/thresholds.
test.skip(process.env.LOAD_READINESS_DIAGNOSTIC !== 'true', 'Explicit diagnostic opt-in required');
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
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
    const failures = new Map<string, number>();
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
