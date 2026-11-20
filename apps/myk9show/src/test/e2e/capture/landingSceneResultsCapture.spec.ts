import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  ALLOW_PRODUCTION_FIXTURE_SIGN_IN,
  bundleFilesNamingProduction,
} from '../../productionFixtureGuard';
import {
  OUTBOUND_PROBE,
  captureStartProblem,
  probeOutbound,
  serveFontsFrom,
} from '../helpers/landingCapture';
import { signIn } from '../helpers/testUsers';
import { signInAsSecretary } from '../uat/shared/auth';
import { box, holdWebSockets, proveSocketHold, type Box } from './captureKit';

/**
 * Suite category: capture (not a regression test; runs only in the Landing capture workflow).
 *
 * Takes the landing page's "Results" scene from the running app: the secretary's desktop
 * (1440x900) from the Results tab listing a finished class to its release, and the exhibitor's
 * phone (390x844 at 2x) from My Entries to the result card (docs/plan-landing-animated-timeline.md
 * § "The 'Results' scene", MYK9-2308). It is the Entries open capture's sibling and keeps all of
 * its guarantees:
 *   - the backend is the job's own Supabase stack on this machine, seeded from the repo's
 *     demo seed only and destroyed with the job, so every row is a fixture and the release is
 *     a real one;
 *   - the job has closed the outbound network for this process, the browser and the preview
 *     server, and the spec proves it before it signs in.
 * Release works online only, and so does this walk: the secretary's page is connected to the
 * job's own stack for the whole walk (only its sockets are held).
 *
 * It writes the images (public/landing/scenes/results/) and the measured regions
 * (src/components/landing/lifecycle/scenes/resultsRegions.json) under CAPTURE_OUT_DIR, laid
 * out as they sit in the repository; the workflow checks all of them are there and uploads
 * them. It runs after the ring and Entries open captures (the files sort so); its own setup SQL
 * starts the show over, whatever they left, and stages one finished class.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
/** A phone: the page draws the scene about 235px wide on one, and 390 reads at that size. */
const PHONE = { width: 390, height: 844 };
const PHONE_SCALE = 2;
const DESK = { width: 1440, height: 900 };
const DESK_SCALE = 1;
// landingResultsSetup.sql stages Container Novice A as finished: Piper (the exhibitor's dog, the
// one the Entries open scene follows) is first, Qualified; the class is marked Complete and not
// yet checked or released.
const CLASS_NAME = 'Container Novice A';
const DOG = 'Piper';
const EXHIBITOR_EMAIL = 'exhibitor2@myk9t.com';
const SETUP_SQL = join(dirname(fileURLToPath(import.meta.url)), 'landingResultsSetup.sql');

const APP_DIR = process.cwd();
// The capture is written under CAPTURE_OUT_DIR, an empty folder the job makes, laid out as
// the files sit in the repository, never over the checked-in copies: what the job uploads
// can then only be what this run took.
const OUT_APP_DIR = join(process.env.CAPTURE_OUT_DIR ?? '', 'apps', 'myk9show');
const IMG_DIR = join(OUT_APP_DIR, 'public', 'landing', 'scenes', 'results');
const REGIONS_FILE = join(
  OUT_APP_DIR,
  'src',
  'components',
  'landing',
  'lifecycle',
  'scenes',
  'resultsRegions.json'
);

type Shots = Record<string, { file: string; regions: Record<string, Box> }>;
type Regions = Record<string, Locator | [Locator, number, number]>;

test.use({
  viewport: PHONE,
  deviceScaleFactor: PHONE_SCALE,
  hasTouch: true,
  serviceWorkers: 'block',
  // Words, not pictures: the only images this spec leaves behind are the scene's own.
  screenshot: 'off',
  video: 'off',
  trace: 'off',
});

// Every other Playwright config collects this file too; there it is skipped, not run.
test.skip(
  process.env.PLAYWRIGHT_LANDING_CAPTURE !== 'true',
  'Runs only in the Landing capture workflow (PLAYWRIGHT_LANDING_CAPTURE=true).'
);

test.beforeAll(async () => {
  const problem = captureStartProblem({
    inWorkflow: process.env.GITHUB_ACTIONS === 'true',
    productionOptIn: process.env[ALLOW_PRODUCTION_FIXTURE_SIGN_IN] !== undefined,
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    bundleFound: existsSync(join(APP_DIR, 'dist', 'index.html')),
    bundleFilesNamingProduction: bundleFilesNamingProduction(join(APP_DIR, 'dist')).length,
    outbound: await probeOutbound(OUTBOUND_PROBE.host, OUTBOUND_PROBE.port),
  });
  if (problem) throw new Error(problem);
});

test('no WebSocket the capture opens reaches a server', async ({ browser, baseURL }) => {
  await proveSocketHold(browser, baseURL);
});

/** The page's words and address, logged when a step fails, so a failed run can be read. */
async function stage<T>(label: string, page: Page, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const text = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    console.log(`STAGE FAILED :: ${label} :: ${page.url()}\n${text.slice(0, 3000)}`);
    throw error;
  }
}

/** Scroll the element to the middle of its scroll container, at once (the app scrolls smoothly). */
const scrollToMiddle = (target: Locator) =>
  target.first().evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));

/**
 * Data arrives after the page renders, so a state that is not there yet is waited for by
 * reloading, a few times, rather than by a longer wait.
 */
async function reloadUntilVisible(page: Page, target: Locator, tries = 8) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await expect(target).toBeVisible({ timeout: 12_000 });
      return;
    } catch (error) {
      if (attempt >= tries) throw error;
      await page.reload();
    }
  }
}

/** The captures are set in the app's own fonts, served from the job's downloaded copy. */
async function expectAppFont(page: Page) {
  // `document.fonts.check` is true when no face is registered at all, so ask for a face of
  // the app's body font that has really loaded.
  await page.evaluate(() => document.fonts.ready);
  const loadedFaces = await page.evaluate(() =>
    [...document.fonts]
      .filter(face => face.status === 'loaded')
      .map(face => face.family.replaceAll('"', ''))
  );
  expect(loadedFaces).toContain('Montserrat');
}

/** The "Results released" and "Scores checked" toasts leave on their own; wait for them. */
async function waitForToastsToLeave(page: Page) {
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 30_000 });
}

test('captures the Results scene on the secretary’s desktop and the exhibitor’s phone', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(420_000);
  const fontsDir = process.env.CAPTURE_FONTS_DIR;
  if (!fontsDir) throw new Error('CAPTURE_FONTS_DIR is not set');
  if (!process.env.CAPTURE_OUT_DIR) throw new Error('CAPTURE_OUT_DIR is not set');
  if (existsSync(IMG_DIR) || existsSync(REGIONS_FILE)) {
    throw new Error(`${IMG_DIR} already exists; the capture writes to an empty folder`);
  }
  mkdirSync(IMG_DIR, { recursive: true });
  mkdirSync(dirname(REGIONS_FILE), { recursive: true });

  // The job's own database, set up for the walk. psql is given the stack's own URL, and only
  // when that is this machine; the start conditions above already refused anything else.
  const dbUrl = process.env.SUPABASE_DB_URL ?? '';
  expect(['127.0.0.1', 'localhost']).toContain(new URL(dbUrl).hostname);
  execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', SETUP_SQL], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  await serveFontsFrom(context, fontsDir);
  const heldPhoneSockets = await holdWebSockets(context);
  // The secretary's desktop is a second browser context, so everything the first one is
  // given is given to it as well, before it opens a page.
  const deskContext = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    viewport: DESK,
    deviceScaleFactor: DESK_SCALE,
    serviceWorkers: 'block',
  });
  await serveFontsFrom(deskContext, fontsDir);
  const heldDeskSockets = await holdWebSockets(deskContext);
  const desk = await deskContext.newPage();

  const phoneShots: Shots = {};
  const deskShots: Shots = {};
  const shoot = async (
    device: 'phone' | 'desk',
    target: Page,
    shots: Shots,
    name: string,
    regions: Regions
  ) => {
    const measured: Record<string, Box> = {};
    for (const [key, region] of Object.entries(regions)) {
      measured[key] = Array.isArray(region) ? await box(...region) : await box(region);
    }
    // One folder holds both devices' captures, so each file names its device.
    const file = `${device}-${name}.png`;
    await target.screenshot({ path: join(IMG_DIR, file) });
    shots[name] = { file, regions: measured };
  };

  try {
    // Line 1: the Results tab lists the finished class, with what to do next.
    await signInAsSecretary(desk, `/shows/${SHOW_ID}/results`);
    const classRows = desk.getByRole('list', { name: 'Classes' }).getByRole('listitem');
    const classRow = classRows.filter({ hasText: CLASS_NAME }).first();
    await stage('the Results tab', desk, () => reloadUntilVisible(desk, classRow));
    await expectAppFont(desk);
    const checkScores = classRow.getByRole('link', { name: `Check scores: ${CLASS_NAME}` });
    await expect(checkScores).toBeVisible();
    console.log('the class row reads ::', (await classRow.innerText()).replace(/\s+/g, ' '));
    await scrollToMiddle(classRow);
    await desk.waitForTimeout(1200);
    await shoot('desk', desk, deskShots, 'list', { row: classRow, action: checkScores });

    // Line 2: open the class; the placements are in its table.
    const detail = desk.getByRole('region', { name: `${CLASS_NAME} results` });
    await stage('the class', desk, async () => {
      await classRow.locator('a').first().click();
      await expect(detail).toBeVisible({ timeout: 30_000 });
      await expect(detail.locator('tbody tr').filter({ hasText: DOG })).toHaveCount(1, {
        timeout: 30_000,
      });
      // The table's Place column carries the placements, 1 to 3.
      await expect(detail.locator('tbody tr')).toHaveCount(3);
      const places = await detail.locator('tbody tr td:first-child').allInnerTexts();
      expect(places.map(text => text.trim())).toEqual(['1', '2', '3']);
      const table = detail.locator('div.overflow-x-auto').first();
      await scrollToMiddle(table);
      await desk.waitForTimeout(1200);
      await shoot('desk', desk, deskShots, 'class', { table });
    });

    // The exhibitor's phone, before the release: My Entries holds the dog's class and no
    // "New result" yet.
    const exhibitorPassword = process.env.E2E_EXHIBITOR2_PASSWORD ?? '';
    await signIn(page, EXHIBITOR_EMAIL, exhibitorPassword, '/exhibitor/entries');
    const dogCard = page.locator('.myk9-entries-dog-card').filter({
      has: page.locator('.myk9-entries-dog-card-name', { hasText: DOG }),
    });
    const classLine = dogCard.locator('.myk9-entries-class-row').filter({ hasText: CLASS_NAME });
    await stage('My Entries, before the release', page, async () => {
      await reloadUntilVisible(page, classLine.first());
      await expectAppFont(page);
      await expect(page.getByRole('button', { name: 'New result' })).toHaveCount(0);
      await scrollToMiddle(classLine);
      await page.waitForTimeout(1200);
      console.log(
        'the class line reads before ::',
        (await classLine.first().innerText()).replace(/\s+/g, ' ')
      );
      await expect(page.getByText('Show your results publicly?')).toHaveCount(0);
      await shoot('phone', page, phoneShots, 'before', { row: classLine });
    });

    // Line 3: one press releases the class. The Release button is the frame before it.
    const release = detail.getByRole('button', { name: 'Release results' });
    await stage('the Release button', desk, async () => {
      await expect(release).toBeEnabled({ timeout: 30_000 });
      await scrollToMiddle(release);
      await desk.waitForTimeout(1200);
      // The button's own card, the smallest block around it that is wider than the button.
      await shoot('desk', desk, deskShots, 'release', {
        button: release,
        card: [release, 300, 60],
      });
    });
    const chips = detail.locator('header div.flex.flex-wrap').first();
    await stage('releasing', desk, async () => {
      await release.click();
      await expect(chips.getByText('Released', { exact: true })).toHaveCount(2, {
        timeout: 60_000,
      });
      await expect(chips.getByText('Not released')).toHaveCount(0);
      await waitForToastsToLeave(desk);
      await scrollToMiddle(detail.locator('header'));
      await desk.waitForTimeout(1200);
      console.log('the class reads after ::', (await chips.innerText()).replace(/\s+/g, ' '));
      await shoot('desk', desk, deskShots, 'released', {
        chips,
        header: detail.locator('header'),
      });
    });

    // Line 4: the release reaches the phone, as New result on the dog's class and then its card.
    // Only the motion is stilled (the card celebrates with confetti), never the words.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const newResult = classLine.getByRole('button', { name: 'New result' });
    await stage('My Entries, New result', page, async () => {
      await page.reload();
      await reloadUntilVisible(page, newResult, 10);
      await scrollToMiddle(newResult);
      await page.waitForTimeout(1200);
      // She answered the one-time results question, so it is in no frame (MYK9-1944).
      await expect(page.getByText('Show your results publicly?')).toHaveCount(0);
      await shoot('phone', page, phoneShots, 'new', { button: newResult });
    });
    await stage('the result card', page, async () => {
      await newResult.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'New result' })).toBeVisible({
        timeout: 30_000,
      });
      const card = dialog.locator('div.overflow-hidden.rounded-lg.border').first();
      await expect(card).toContainText(DOG);
      await page.waitForTimeout(1500);
      console.log('the result card reads ::', (await card.innerText()).replace(/\s+/g, ' '));
      await shoot('phone', page, phoneShots, 'card', { card });
    });

    writeFileSync(
      REGIONS_FILE,
      `${JSON.stringify(
        {
          phone: { space: PHONE, scale: PHONE_SCALE, shots: phoneShots },
          desk: { space: DESK, scale: DESK_SCALE, shots: deskShots },
        },
        null,
        2
      )}\n`
    );
    // The app opened its realtime socket in these contexts and they held it: the hold was
    // installed on the capture's own pages, not only proved in the test above. Which of the two
    // pages opens one depends on the role signed in, so the sockets are counted together.
    const held = [...heldPhoneSockets, ...heldDeskSockets];
    expect(held.length).toBeGreaterThan(0);
    expect(held.every(url => url.endsWith('/realtime/v1/websocket'))).toBe(true);
    console.log(
      'sockets held in the browser ::',
      [...new Set([...heldPhoneSockets, ...heldDeskSockets])].join(', ')
    );
  } finally {
    await deskContext.close();
  }
});
