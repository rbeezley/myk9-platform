// Captures the "Show day, at the ring" scene: the judge's tablet, from the class list to a
// score that sends itself when the signal returns.
//
//   pnpm --filter @myk9/show capture:landing:ring      (with `pnpm dev:show` running)
//
// Writes the images to public/landing/scenes/ring/ and the measured regions to
// src/components/landing/lifecycle/scenes/ringRegions.json.
//
// Nothing is written to the database (see lib.ts). Three things are staged in the browser:
//   - Dogs that are not seed fixtures are left out of every list the tablet receives.
//   - The tablet is cut off from the backend before the scoresheet opens, because opening a
//     scoresheet online moves the dog to "In ring" for everyone.
//   - When the signal "returns", the score upload is answered inside the browser and the
//     read that confirms it is given the same fields, so the app shows what it shows when the
//     server has accepted a score. The request never leaves the machine.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { APP_DIR, BASE, SHOW, box, guardBackend, launch, pageText, settle, signIn } from './lib.ts';
import type { Box } from './lib.ts';

const SPACE = { width: 768, height: 1024 };
const SCALE = 1.5;
const CLASS_NAME = 'Container Novice A';
const DOG = 'Cooper';
/** Armbands on the seed show that belong to accounts created after the seed. */
const NOT_FIXTURES = new Set([106, 107, 108, 109, 110, 111]);
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

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Fields the app "sent", keyed by entry id, laid over what the server says on later reads. */
const accepted = new Map<string, Row>();

function patch(body: unknown): unknown {
  if (!Array.isArray(body)) return body;
  return body
    .filter(row => !(isRow(row) && NOT_FIXTURES.has(Number(row.armband))))
    .map(row => {
      const sent = isRow(row) && typeof row.id === 'string' ? accepted.get(row.id) : undefined;
      return sent ? { ...row, ...sent } : row;
    });
}

const shots: Record<string, { file: string; regions: Record<string, Box> }> = {};

async function shoot(
  page: Page,
  name: string,
  regions: Record<string, Locator | [Locator, number, number]>
) {
  const measured: Record<string, Box> = {};
  for (const [key, target] of Object.entries(regions)) {
    measured[key] = Array.isArray(target) ? await box(...target) : await box(target);
  }
  const file = `${name}.png`;
  await page.screenshot({ path: join(IMG_DIR, file) });
  shots[name] = { file, regions: measured };
  console.log(`${name} :: ${await pageText(page, 260)}`);
}

mkdirSync(IMG_DIR, { recursive: true });
const browser = await launch();
try {
  const ctx = await browser.newContext({
    viewport: SPACE,
    deviceScaleFactor: SCALE,
    hasTouch: true,
  });
  const guard = await guardBackend(ctx, patch);
  const page = await ctx.newPage();
  const button = (name: string | RegExp) => page.getByRole('button', { name, exact: true });

  await signIn(page, 'judge');

  // Line 1: the ring's classes, each with how many dogs are scored.
  await page.goto(`${BASE}/at-show/${SHOW}`);
  await settle(page, 5000);
  await page.getByText('Your ring').first().waitFor();
  await shoot(page, 'classes', { card: [page.getByText(CLASS_NAME).first(), 560, 120] });

  // Line 2: the signal drops. Nothing has been scored offline yet, so the header reads
  // "Offline · scores saved on this device".
  await page.getByText(CLASS_NAME).first().click();
  await settle(page, 4000);
  await guard.goOffline(page);
  const offline = page.getByText('Offline · scores saved on this device');
  await offline.waitFor();
  await page.waitForTimeout(800);
  await shoot(page, 'offline', { status: offline });
  await page
    .getByRole('button', { name: 'Close toast' })
    .click()
    .catch(() => {});

  // Line 3: Start, Stop, then the result.
  await page.getByTestId('dog-card').filter({ hasText: DOG }).first().click();
  await button('Start').waitFor();
  await page.waitForTimeout(600);
  await shoot(page, 'sheet', { start: button('Start') });
  await button('Start').click();
  await page.waitForTimeout(RUN_MS);
  await shoot(page, 'running', {
    timer: [button('Stop'), 600, 150],
    time: page.getByText(/^\d:\d\d\.\d\d$/).first(),
  });
  await button('Stop').click();
  await button('Qualified').click();
  await page.waitForTimeout(600);
  await shoot(page, 'result', { result: [button('Qualified'), 600, 100] });

  // Line 4: the read-back, then the list of dogs with the saved line.
  await button('Save').click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Score Confirmation' });
  await dialog.waitFor();
  await page.waitForTimeout(600);
  await shoot(page, 'confirm', { dialog });
  await button('Confirm & Submit').click();
  const saved = page.getByText('Saved:').first();
  await saved.waitFor();
  await page.waitForTimeout(1200);
  await shoot(page, 'saved', { text: [saved, 300, 0] });

  // Line 5: the signal returns and the score sends itself.
  let version = 100_000;
  guard.stageRpcAnswer('ringside_update_entry', args => {
    if (isRow(args) && typeof args.p_entry_id === 'string' && isRow(args.p_fields)) {
      accepted.set(args.p_entry_id, { ...accepted.get(args.p_entry_id), ...args.p_fields });
    }
    version += 1;
    return version;
  });
  await guard.goOnline(page);
  const sent = page.getByText('Scores sent').first();
  await sent.waitFor({ timeout: 45_000 });
  await page.waitForTimeout(500);
  await shoot(page, 'sent', {
    toast: [sent, 200, 40],
    text: [saved, 300, 0],
  });

  writeFileSync(
    REGIONS_FILE,
    `${JSON.stringify({ space: SPACE, scale: SCALE, shots }, null, 2)}\n`
  );
  console.log('refused writes ::', [...new Set(guard.refused)].join(', ') || 'none');
  await ctx.close();
} finally {
  await browser.close();
}
