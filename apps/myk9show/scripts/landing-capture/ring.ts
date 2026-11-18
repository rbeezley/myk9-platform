// Captures the "Show day, at the ring" scene: the judge's phone, from the class list to a
// score that sends itself when the signal returns.
//
//   pnpm --filter @myk9/show capture:landing:ring
//
// Needs an isolated Supabase stack (pnpm qa:isolated-e2e:prepare) and a dev server pointed at
// it; the Landing capture workflow does both and uploads what this writes. It refuses to run
// against a hosted project (guardRules.ts).
//
// Writes the images to public/landing/scenes/ring/ and the measured regions to
// src/components/landing/lifecycle/scenes/ringRegions.json.
//
// Nothing is written to the database. Three things are staged in the browser:
//   - Dogs off the scene's armband list are left out of every list the phone receives.
//   - The phone is cut off from the backend before the scoresheet opens, because opening a
//     scoresheet online moves the dog to "In ring".
//   - When the signal "returns", the score upload is answered inside the browser and the
//     read that confirms it is given the same fields, so the app shows what it shows when the
//     server has accepted a score. The request never leaves the machine.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator } from '@playwright/test';
import { isRow, patchFixtureRows, writeCheckedShot } from './guardRules.ts';
import type { Row } from './guardRules.ts';
import {
  APP_DIR,
  BASE,
  SHOW,
  armbandLabels,
  box,
  goOffline,
  goOnline,
  guardedContext,
  launch,
  logGuard,
  pageText,
  settle,
  signIn,
  visibleText,
} from './lib.ts';
import type { Box } from './lib.ts';

/** A phone: the page draws the scene about 235px wide on one, and 390 reads at that size. */
const SPACE = { width: 390, height: 844 };
const SCALE = 2;
// On the seed, Interior Advanced is the judge's first class with nothing scored: Willow (100)
// and Ranger (101). Container Novice A is seeded complete, with its results released.
const CLASS_NAME = 'Interior Advanced';
const DOG = 'Willow';
/**
 * The armbands this scene shows: the demo seed's own entries on this show (seed-demo.sql).
 * Every other row that carries an armband is left out (the load fixture's 2001 to 2063, and
 * anything an earlier walk on the same stack entered), so the lists stay the size a small
 * trial's are.
 */
const FIXTURE_ARMBANDS = new Set([100, 101, 102, 103, 104, 105]);
/** How long the judge's timer runs before Stop, so the time on screen looks like a search. */
const RUN_MS = 38_000;

const IMG_DIR = join(APP_DIR, 'public', 'landing', 'scenes', 'ring');
const REGIONS_FILE = join(
  APP_DIR,
  'src',
  'components',
  'landing',
  'lifecycle',
  'scenes',
  'ringRegions.json'
);

/** Fields the app "sent", keyed by entry id, laid over what the server says on later reads. */
const accepted = new Map<string, Row>();

const shots: Record<string, { file: string; regions: Record<string, Box> }> = {};

mkdirSync(IMG_DIR, { recursive: true });
const browser = await launch();
try {
  const { ctx, guard } = await guardedContext(browser, {
    viewport: SPACE,
    scale: SCALE,
    patch: {
      paths: /entr|armband/i,
      rows: body => patchFixtureRows(body, FIXTURE_ARMBANDS, accepted),
    },
  });
  const page = await ctx.newPage();
  try {
    const button = (name: string | RegExp) => page.getByRole('button', { name, exact: true });

    /** Measure, then write the image through the one checked path (writeCheckedShot). */
    const shoot = async (
      name: string,
      regions: Record<string, Locator | [Locator, number, number]>
    ) => {
      const measured: Record<string, Box> = {};
      for (const [key, target] of Object.entries(regions)) {
        measured[key] = Array.isArray(target) ? await box(...target) : await box(target);
      }
      const file = `${name}.png`;
      await writeCheckedShot(name, FIXTURE_ARMBANDS, {
        assertIsolated: guard.assertIsolated,
        read: async () => {
          const [text, labels] = await Promise.all([visibleText(page), armbandLabels(page)]);
          return { text, labels };
        },
        write: async () => {
          await page.screenshot({ path: join(IMG_DIR, file) });
        },
      });
      shots[name] = { file, regions: measured };
      console.log(`${name} :: ${await pageText(page, 260)}`);
    };

    await signIn(page, guard, 'judge');

    // Line 1: the ring's classes, each with how many dogs are scored. The whole card is
    // measured: the <li> the class row renders (AtShowClassRow, data-class-id).
    await page.goto(`${BASE}/at-show/${SHOW}`);
    await settle(page, 5000);
    await page.getByText('Your ring').first().waitFor();
    const card = page.locator('li[data-class-id]').filter({ hasText: CLASS_NAME }).first();
    await card.scrollIntoViewIfNeeded();
    await shoot('classes', { card });

    // Line 2: the signal drops. Nothing has been scored offline yet, so the header reads
    // "Offline · scores saved on this device".
    await card.getByRole('button').first().click();
    await settle(page, 4000);
    await goOffline(page, guard);
    const offline = page.getByText('Offline · scores saved on this device');
    await offline.waitFor();
    await page.waitForTimeout(800);
    await shoot('offline', { status: offline });
    await page
      .getByRole('button', { name: 'Close toast' })
      .click()
      .catch(() => {});

    // Line 3: Start, Stop, then the result.
    await page.getByTestId('dog-card').filter({ hasText: DOG }).first().click();
    await button('Start').waitFor();
    await page.waitForTimeout(600);
    await shoot('sheet', { start: button('Start') });
    await button('Start').click();
    await page.waitForTimeout(RUN_MS);
    await shoot('running', {
      timer: [button('Stop'), 300, 120],
      time: page.getByText(/^d:dd.dd$/).first(),
    });
    await button('Stop').click();
    await button('Qualified').click();
    await page.waitForTimeout(600);
    await shoot('result', { result: [button('Qualified'), 300, 80] });

    // Line 4: the read-back, then the list of dogs with the saved line.
    await button('Save').click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Score Confirmation' });
    await dialog.waitFor();
    await page.waitForTimeout(600);
    await shoot('confirm', { dialog });
    await button('Confirm & Submit').click();
    const saved = page.getByText('Saved:').first();
    await saved.waitFor();
    await page.waitForTimeout(1200);
    await shoot('saved', { text: [saved, 240, 0] });

    // Line 5: the signal returns and the score sends itself.
    let version = 100_000;
    guard.stageRpcAnswer('ringside_update_entry', args => {
      if (isRow(args) && typeof args.p_entry_id === 'string' && isRow(args.p_fields)) {
        accepted.set(args.p_entry_id, { ...accepted.get(args.p_entry_id), ...args.p_fields });
      }
      version += 1;
      return version;
    });
    await goOnline(page, guard);
    const sent = page.getByText('Scores sent').first();
    await sent.waitFor({ timeout: 45_000 });
    await page.waitForTimeout(500);
    await shoot('sent', {
      toast: [sent, 200, 40],
      text: [saved, 240, 0],
    });

    guard.assertIsolated();
    writeFileSync(
      REGIONS_FILE,
      `${JSON.stringify({ space: SPACE, scale: SCALE, shots }, null, 2)}
`
    );
  } catch (err) {
    // Words, not a picture: an image is only ever written through writeCheckedShot.
    console.error(`failed at ${page.url()} :: ${await pageText(page, 1500).catch(() => '')}`);
    throw err;
  } finally {
    logGuard(guard);
  }
  await ctx.close();
} finally {
  await browser.close();
}
