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
import {
  chipById,
  chipClassId,
  clickClearOfStickyChrome,
  enabledClassChips,
  waitForChipsToSettle,
} from '../registration/wizardChips';
import { signInAsSecretary } from '../uat/shared/auth';
import { box, holdWebSockets, proveSocketHold, type Box } from './captureKit';

/**
 * Suite category: capture (not a regression test; runs only in the Landing capture workflow).
 *
 * Takes the landing page's "Entries open" scene from the running app: the exhibitor's phone
 * (390x844 at 2x) and the secretary's desktop (1440x900), from the exhibitor's dogs and
 * classes to the secretary accepting the form (docs/plan-landing-animated-timeline.md
 * § "The 'Entries open' scene", MYK9-2296). It is the ring capture's sibling and keeps all of
 * its guarantees:
 *   - the backend is the job's own Supabase stack on this machine, seeded from the repo's
 *     demo seed only and destroyed with the job, so every row is a fixture and the walk
 *     enters and accepts for real;
 *   - the job has closed the outbound network for this process, the browser and the preview
 *     server, and the spec proves it before it signs in.
 * The card checkout is Stripe's own page and cannot be reached from here, so line 2 is the
 * wizard's Payment step with its "Pay $X.XX" button; the walk then pays by check, which ends
 * on the Receipt without leaving the app.
 *
 * It writes the images (public/landing/scenes/entries/) and the measured regions
 * (src/components/landing/lifecycle/scenes/entriesRegions.json) under CAPTURE_OUT_DIR, laid
 * out as they sit in the repository; the workflow checks all of them are there and uploads
 * them. It runs after the ring capture (the files sort so), which scores a dog in the same
 * database, and enters in a class that capture does not read.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
/** A phone: the page draws the scene about 235px wide on one, and 390 reads at that size. */
const PHONE = { width: 390, height: 844 };
const PHONE_SCALE = 2;
const DESK = { width: 1440, height: 900 };
const DESK_SCALE = 1;
// The second demo exhibitor has no entries anywhere; landingEntriesSetup.sql gives her two dogs and
// one form at the show (the job's own database, before the walk). Piper is the dog the walk
// enters; Tessa is already in the full class, so for Piper it reads Full. Her card on My Entries
// reads Pending review before the walk and Accepted after it.
const DOG = 'Piper';
const EXHIBITOR_EMAIL = 'exhibitor2@myk9t.com';
const SETUP_SQL = join(dirname(fileURLToPath(import.meta.url)), 'landingEntriesSetup.sql');
// Classes a fresh dog can be entered in and the ring capture does not read.
const CLASSES_TO_ENTER = [
  'Buried Novice A',
  'Handler Discrimination Novice A',
  'Container Advanced',
];
// Handler Discrimination Advanced on trial 4 holds one entry against a limit of one, and no
// waitlist, so the wizard marks it Full (supabase/seed-demo.sql, MYK9-515).
const FULL_CLASS_ID = 'dec1a55e-0000-0000-0000-000000000045';

const APP_DIR = process.cwd();
// The capture is written under CAPTURE_OUT_DIR, an empty folder the job makes, laid out as
// the files sit in the repository, never over the checked-in copies: what the job uploads
// can then only be what this run took.
const OUT_APP_DIR = join(process.env.CAPTURE_OUT_DIR ?? '', 'apps', 'myk9show');
const IMG_DIR = join(OUT_APP_DIR, 'public', 'landing', 'scenes', 'entries');
const REGIONS_FILE = join(
  OUT_APP_DIR,
  'src',
  'components',
  'landing',
  'lifecycle',
  'scenes',
  'entriesRegions.json'
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
 * Availability and sync arrive after the page renders, so a state that is not there yet is
 * waited for by reloading, a few times, rather than by a longer wait.
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

test('captures the Entries open scene on the exhibitor’s phone and the secretary’s desktop', async ({
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
    // The secretary's list before the exhibitor enters: lines 1 to 3 rest on it.
    await signInAsSecretary(desk, `/shows/${SHOW_ID}/entries`);
    const queue = desk.getByRole('list', { name: 'Entry form work queue' });
    const rows = queue.getByRole('listitem');
    await stage('the secretary’s list before', desk, () =>
      expect(rows.first()).toBeVisible({ timeout: 60_000 })
    );
    await expectAppFont(desk);
    // The list shows no class-limit figure: the limit is enforced when the exhibitor enters.
    expect(await queue.innerText()).not.toMatch(
      /class limit|max(imum)? entries|capacity|spots? (left|remaining)/i
    );
    // The exhibitor has one entry form at the show (Tessa's), so her new entry joins it: the row's
    // count of entries is how the capture knows the new one has arrived. (A row's text runs its
    // elements together, so the count is matched after anything but a digit, not at a word edge.)
    const entryCount = async (row: Locator) =>
      Number(/(\d+) Entr(?:y|ies)/.exec(await row.innerText())?.[1]);
    const entriesBefore = await entryCount(rows.filter({ hasText: 'Riley Parker' }).first());
    expect(entriesBefore, 'the exhibitor’s form is in the list').toBeGreaterThan(0);
    console.log('entries on the form before ::', entriesBefore);
    await desk.waitForTimeout(1500);
    await shoot('desk', desk, deskShots, 'before', {
      queue: desk.locator('section[aria-label="Entry forms"]'),
    });

    // Line 1: the exhibitor picks a dog, then classes, and a full class says so.
    const exhibitorPassword = process.env.E2E_EXHIBITOR2_PASSWORD ?? '';
    await signIn(page, EXHIBITOR_EMAIL, exhibitorPassword, `/shows/${SHOW_ID}/register`);
    await stage('the wizard', page, () =>
      expect(page.getByRole('heading', { name: 'Enter This Show' })).toBeVisible({
        timeout: 60_000,
      })
    );
    await expectAppFont(page);
    const dogOption = page.locator(`[role="checkbox"][aria-label^="Select ${DOG}"]`).first();
    await stage('the dogs step', page, async () => {
      await expect(dogOption).toBeVisible({ timeout: 30_000 });
      await clickClearOfStickyChrome(page, dogOption);
      await expect(dogOption).toHaveAttribute('aria-checked', 'true');
    });
    // The dog's card whole, between the sticky header and the sticky entry bar.
    await scrollToMiddle(dogOption);
    await page.waitForTimeout(800);
    await shoot('phone', page, phoneShots, 'dogs', { row: [dogOption, 300, 150] });
    await clickClearOfStickyChrome(page, page.getByRole('button', { name: /^Next$/ }));

    await stage('the classes step', page, async () => {
      await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await waitForChipsToSettle(page);
      const idSelector = `chip-${FULL_CLASS_ID}`;
      const fullCheckbox = page
        .getByRole('checkbox')
        .and(
          page.locator(`[id="${idSelector}"], label:has([id="${idSelector}"]) [role="checkbox"]`)
        );
      await expect(fullCheckbox, 'the seeded full class must render').toBeVisible();
      // The chip's wrapper holds the label, the reason and the Full badge as siblings; nested
      // wrappers match too, so the last in the document is the innermost.
      const fullChip = page.locator('div.flex.flex-col.gap-1').filter({ has: fullCheckbox }).last();
      await expect(fullChip.getByText('Full', { exact: true })).toBeVisible();
      const describedBy = await fullCheckbox.getAttribute('aria-describedby');
      expect(describedBy, 'a full chip carries its reason').toBeTruthy();
      await expect(page.locator(`#${describedBy}`)).toContainText(/is full/);
      await scrollToMiddle(fullChip);
      await page.waitForTimeout(800);
      await shoot('phone', page, phoneShots, 'classes', { chip: fullChip });
    });

    let enteredClass = '';
    await stage('choosing a class', page, async () => {
      let classId = '';
      for (const name of CLASSES_TO_ENTER) {
        const chips = enabledClassChips(page).and(
          page.getByRole('checkbox', { name: new RegExp(`^Enter ${DOG} in ${name}$`) })
        );
        if ((await chips.count()) > 0) {
          classId = await chipClassId(chips.first());
          enteredClass = name;
          break;
        }
      }
      expect(classId, 'a class the dog can still be entered in').not.toBe('');
      const chip = chipById(page, classId);
      await clickClearOfStickyChrome(page, chip);
      // A cart write, not a render: the chip is checked once the server has the line.
      await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(1, { timeout: 30_000 });
      await clickClearOfStickyChrome(page, page.getByRole('button', { name: /^Next$/ }));
    });

    // Line 2: card is how most pay, and goes to Stripe, which this job cannot reach, so the
    // frame is the Payment step with the button that says what it will charge.
    await stage('the payment step', page, async () => {
      await expect(page.getByRole('heading', { name: 'Payment Information' })).toBeVisible({
        timeout: 30_000,
      });
      const agreement = page.getByText(/I have read and agree to the .* entry agreement/i);
      await expect(agreement).toBeVisible({ timeout: 30_000 });
      await clickClearOfStickyChrome(page, agreement);
      await page
        .getByRole('button', { name: /^Credit\/Debit Card/i })
        .evaluate((button: HTMLElement) => button.click());
      const pay = page
        .getByRole('button', { name: /^Pay \$\d/ })
        .locator('visible=true')
        .first();
      await expect(pay).toBeVisible({ timeout: 30_000 });
      // The "added to your entry" toasts out of the way, and the chosen card method in view
      // above the button, with the sentence that says where it goes.
      for (const close of await page.getByRole('button', { name: 'Close toast' }).all()) {
        await close.click().catch(() => {});
      }
      await scrollToMiddle(page.getByRole('button', { name: /^Credit\/Debit Card/i }));
      await page.waitForTimeout(1200);
      await shoot('phone', page, phoneShots, 'payment', { pay });
    });

    // Never pressed: the walk pays by check, which the club turns on in the seed and which
    // ends on the Receipt without leaving the app.
    const confirmation = await stage('the submit', page, async () => {
      await page
        .getByRole('button', { name: /^Check \(pay at show\)/i })
        .evaluate((button: HTMLElement) => button.click());
      const submit = page.getByRole('button', { name: 'Submit, bring check to show', exact: true });
      await expect(submit).toBeEnabled({ timeout: 30_000 });
      await clickClearOfStickyChrome(page, submit);
      const label = page.getByText(/^Confirmation number /).first();
      await expect(label).toBeVisible({ timeout: 90_000 });
      return (await label.innerText()).replace(/^Confirmation number\s+/, '').trim();
    });
    expect(confirmation).not.toBe('');
    console.log(
      'the receipt reads ::',
      (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1200)
    );

    // Line 3: My Entries reads Pending review.
    const dogCard = page.locator('.myk9-entries-dog-card').filter({
      has: page.locator('.myk9-entries-dog-card-name', { hasText: DOG }),
    });
    await stage('My Entries, pending', page, async () => {
      await page.goto('/exhibitor/entries');
      const pending = dogCard.getByText('Pending review', { exact: true }).first();
      await reloadUntilVisible(page, pending);
      await scrollToMiddle(dogCard);
      await page.waitForTimeout(1200);
      console.log(
        'the dog’s card reads ::',
        (await dogCard.first().innerText()).replace(/\s+/g, ' ')
      );
      await shoot('phone', page, phoneShots, 'pending', { badge: [pending, 120, 24] });
    });

    // Line 4: the form is in the secretary's list, marked Needs review, with its payment.
    const form = rows.filter({ hasText: confirmation });
    await stage('the secretary’s list after', desk, async () => {
      // The form is the exhibitor's, as before, with one more entry and still Needs review.
      // Read from the row's own text, which the browser lays out with its spaces.
      const arrived = async () => {
        if ((await form.count()) === 0) return false;
        const text = await form.first().innerText();
        return (await entryCount(form.first())) === entriesBefore + 1 && /Needs review/.test(text);
      };
      for (let attempt = 1; !(await arrived()); attempt += 1) {
        if (attempt > 8) throw new Error('the new entry never reached the secretary’s list');
        await desk.waitForTimeout(8000);
        await desk.reload();
        await expect(rows.first()).toBeVisible({ timeout: 30_000 });
      }
      await form
        .first()
        .getByRole('button', { name: /^Review for / })
        .click();
    });
    const panel = desk.getByRole('region', { name: /^Entry form for / });
    const checklist = panel.getByRole('region', { name: 'To finish this form' });
    const accept = checklist.getByRole('button', { name: 'Accept', exact: true });
    await stage('the form panel', desk, async () => {
      await expect(checklist).toBeVisible({ timeout: 30_000 });
      await expect(accept).toBeVisible();
      await scrollToMiddle(form.first());
      await desk.waitForTimeout(1000);
      await shoot('desk', desk, deskShots, 'list', { row: form.first() });
      // Line 5: one button. The panel lists what is still to do, and Accept is one item.
      await scrollToMiddle(checklist);
      await desk.waitForTimeout(1000);
      await shoot('desk', desk, deskShots, 'review', {
        checklist,
        item: accept.locator('xpath=ancestor::li[1]'),
        accept,
      });
    });

    await stage('accepting', desk, async () => {
      await accept.click();
      const header = panel.locator('header');
      await expect(header).not.toContainText('Needs review', { timeout: 30_000 });
      // The ring is on the entry itself, its row in the form now reading Accepted.
      const entry = panel
        .locator('div')
        .filter({ hasText: new RegExp(`${enteredClass}:\\s*Accepted`) })
        .last();
      await expect(entry).toBeVisible({ timeout: 30_000 });
      await scrollToMiddle(entry);
      await desk.waitForTimeout(1000);
      // The form's Communication section reads "No decision email sent yet" until the email goes
      // out, which line 5 says it will; measured, so the scene's camera can keep it out of frame.
      await shoot('desk', desk, deskShots, 'accepted', {
        entry,
        communication: panel.getByText('Communication and history'),
      });
    });

    // Line 5, on the phone: the entry changes to Accepted.
    await stage('My Entries, accepted', page, async () => {
      await page.reload();
      const accepted = dogCard.getByText('Accepted', { exact: true }).first();
      await reloadUntilVisible(page, accepted, 10);
      await scrollToMiddle(dogCard);
      await page.waitForTimeout(1200);
      await shoot('phone', page, phoneShots, 'accepted', { badge: [accepted, 90, 24] });
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
