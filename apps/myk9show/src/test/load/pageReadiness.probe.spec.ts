import { expect, test, type Page } from '@playwright/test';
import { signInAsExhibitor, signInAsSecretary } from '../e2e/helpers/testUsers';
import { LOAD_CLASS_IDS, LOAD_SHOW_ID } from './loadFixture';

/**
 * MYK9-126 acceptance criterion 6: reproduce the dominant page-readiness
 * timeouts with a bounded focused test before touching production paths.
 *
 * G9 fails 100/100 workflows on element-visibility timeouts while Supabase sits
 * near idle (~280s of statement time across a 600s window, 0.19% request
 * failures). That was equally true on the dev server, so it is neither the
 * production bundle nor generator saturation. This drives the SAME routes and
 * SAME selectors with ONE session each and no writes: if they resolve quickly
 * here, the timeouts are contention; if they hang, they are an app defect that
 * would hit real users at a show.
 *
 * Read-only by construction. Never add a scoring write here.
 */

const READINESS_BUDGET_MS = 60_000;

interface ReadinessProbe {
  name: string;
  role: 'secretary' | 'exhibitor';
  route: string;
  locate: (page: Page) => ReturnType<Page['locator']>;
}

const PROBES: ReadinessProbe[] = [
  {
    name: 'exhibitor-read / My run schedule',
    role: 'exhibitor',
    route: `/shows/${LOAD_SHOW_ID}?tab=my-entries`,
    locate: page => page.getByRole('heading', { name: 'My run schedule' }),
  },
  {
    name: 'operations-read / Show Desk',
    role: 'secretary',
    route: `/shows/${LOAD_SHOW_ID}/show-desk`,
    locate: page => page.getByRole('heading', { name: 'Show Desk', exact: true }),
  },
  {
    name: 'run-order-read / dog-card',
    role: 'secretary',
    route: `/at-show/${LOAD_SHOW_ID}/class/${LOAD_CLASS_IDS[0]}`,
    locate: page => page.getByTestId('dog-card').first(),
  },
  {
    name: 'ringside-scoring / submit-btn (read-only: never submits)',
    role: 'secretary',
    route: `/at-show/${LOAD_SHOW_ID}/class/${LOAD_CLASS_IDS[0]}/score/a1090000-0000-0000-0002-000000000401`,
    locate: page => page.getByTestId('submit-btn'),
  },
];

for (const probe of PROBES) {
  test(`page readiness: ${probe.name}`, async ({ browser }, testInfo) => {
    testInfo.setTimeout(4 * 60_000);
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const failures: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') failures.push(`console: ${message.text()}`);
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        failures.push(`http ${response.status()}: ${response.url()}`);
      }
    });

    try {
      if (probe.role === 'secretary') await signInAsSecretary(page, '/shows');
      else await signInAsExhibitor(page, '/shows');

      const navigationStartedAt = Date.now();
      await page.goto(probe.route, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      const domReadyMs = Date.now() - navigationStartedAt;

      let visibleMs: number | null = null;
      try {
        await probe.locate(page).waitFor({ state: 'visible', timeout: READINESS_BUDGET_MS });
        visibleMs = Date.now() - navigationStartedAt;
      } catch {
        visibleMs = null;
      }

      console.log(
        JSON.stringify(
          {
            probe: probe.name,
            route: probe.route,
            domReadyMs,
            visibleMs,
            verdict: visibleMs === null ? 'NEVER VISIBLE' : 'visible',
            errors: failures.slice(0, 10),
          },
          null,
          2
        )
      );

      expect(
        visibleMs,
        `${probe.name} never became visible; errors: ${failures.join(' | ')}`
      ).not.toBeNull();
    } finally {
      await context.close();
    }
  });
}
