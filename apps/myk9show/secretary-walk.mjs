#!/usr/bin/env node
// Secretary live-walk regression probe.
//
// Drives the running app as the secretary, reads the "Needs Attention" strip
// count on the dashboard and the "Need Attention" tile count on the show-map
// tab for the same show, and asserts they match. Exists because the Phase 2
// refactor (PR #203) unified the function answering both surfaces — this
// script catches re-divergence at the rendered-DOM level, which the unit test
// in attention-consistency.test.ts cannot.
//
// Usage:
//   node apps/myk9show/secretary-walk.mjs                  # uses defaults
//   BASE_URL=http://127.0.0.1:5173 node apps/myk9show/secretary-walk.mjs
//   SHOW_ID=<uuid> node apps/myk9show/secretary-walk.mjs
//   HEADED=1 node apps/myk9show/secretary-walk.mjs         # show browser
//
// Exit codes:
//   0 — counts match
//   1 — counts diverge or assertion failed (the regression we're guarding)
//   2 — setup error (couldn't sign in, couldn't reach a page, etc.)

import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const SECRETARY_EMAIL = process.env.SECRETARY_EMAIL ?? 'secretary@myk9t.com';
const SECRETARY_PASS = process.env.SECRETARY_PASS ?? 'TestPass4567!';
const SHOW_ID = process.env.SHOW_ID ?? '';
const HEADED = process.env.HEADED === '1';

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function fail(code, msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

async function signIn(page) {
  await page.goto(`${BASE_URL}/sign-in`);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.locator('input[type="email"]').first().fill(SECRETARY_EMAIL);
  await page.locator('input[type="password"]').first().fill(SECRETARY_PASS);
  await Promise.all([
    page.waitForURL(url => !url.href.includes('/sign-in'), { timeout: 20000 }),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await page.waitForLoadState('networkidle');
}

// Reads every strip row matching "<N> entr(y|ies) ..." and groups them per show.
// Returns: Map<showId, { pendingReview, checkInConflicts, total }>
async function readDashboardCounts(page) {
  await page.goto(`${BASE_URL}/secretary/dashboard`);
  await page.waitForLoadState('networkidle');

  // AttentionNeededStrip renders <Link to={item.href}> per row. href is
  // /secretary/entries/<showId>, which gives us a stable showId-per-row read.
  // The visible text matches one of:
  //   "<N> entry pending review"
  //   "<N> entries pending review"
  //   "<N> entry with check-in conflicts"
  //   "<N> entries with check-in conflicts"
  const rows = await page.locator('a[href^="/secretary/entries/"]').all();
  const byShow = new Map();
  for (const row of rows) {
    const href = await row.getAttribute('href');
    if (!href) continue;
    const showId = href.replace(/^\/secretary\/entries\//, '');
    const text = (await row.innerText()).trim();
    const pendingMatch = text.match(/(\d+)\s+entr(?:y|ies)\s+pending review/i);
    const conflictMatch = text.match(/(\d+)\s+entr(?:y|ies)\s+with check-in conflicts/i);
    if (!pendingMatch && !conflictMatch) continue;
    const existing = byShow.get(showId) ?? {
      pendingReview: 0,
      checkInConflicts: 0,
      total: 0,
    };
    if (pendingMatch) existing.pendingReview += Number(pendingMatch[1]);
    if (conflictMatch) existing.checkInConflicts += Number(conflictMatch[1]);
    existing.total = existing.pendingReview + existing.checkInConflicts;
    byShow.set(showId, existing);
  }
  return byShow;
}

// Reads the "Need Attention" summary tile on the show-map tab for the given
// show. Scopes to the show's data-node-id container (added in PR #197).
async function readShowMapAttention(page, showId) {
  await page.goto(`${BASE_URL}/shows/${showId}?tab=map`);
  await page.waitForLoadState('networkidle');

  const tileContainer = page.locator(
    `[data-node-id="show:${showId}"][data-node-type="show"]`
  );
  await tileContainer.waitFor({ timeout: 15000 });

  // SummaryItem renders: <div>{value}</div><div>{label}</div>. Find the label
  // node, walk up to the tile, read the value child.
  const labelNode = tileContainer.locator('div', { hasText: /^Need Attention$/i }).first();
  await labelNode.waitFor({ timeout: 5000 });
  const tile = labelNode.locator('xpath=..');
  const valueText = (await tile.locator('div').first().innerText()).trim();
  const value = Number.parseInt(valueText, 10);
  if (!Number.isFinite(value)) {
    fail(2, `[setup] show-map tile value not numeric: "${valueText}"`);
  }
  return value;
}

async function main() {
  log(`▶ secretary-walk against ${BASE_URL}`);
  log(`  signing in as ${SECRETARY_EMAIL}`);

  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let exitCode = 0;
  try {
    await signIn(page);
    log('  signed in');

    const dashboardCounts = await readDashboardCounts(page);
    if (dashboardCounts.size === 0) {
      log('  no attention rows on the dashboard — nothing to compare');
      log('  ✔ nothing to assert; treating as pass');
      await browser.close();
      process.exit(0);
    }

    log(`  dashboard rows: ${dashboardCounts.size} show(s) with attention`);
    for (const [showId, counts] of dashboardCounts) {
      log(
        `    ${showId}  pending=${counts.pendingReview} conflicts=${counts.checkInConflicts} total=${counts.total}`
      );
    }

    const showsToCheck = SHOW_ID ? [SHOW_ID] : [...dashboardCounts.keys()];
    for (const showId of showsToCheck) {
      const expected = dashboardCounts.get(showId);
      if (!expected) {
        log(`  ⚠ ${showId} not in dashboard strip — skipping`);
        continue;
      }
      const tileCount = await readShowMapAttention(page, showId);
      const matches = tileCount === expected.total;
      const marker = matches ? '✔' : '✘';
      log(`  ${marker} ${showId}  dashboard=${expected.total}  show-map tile=${tileCount}`);
      if (!matches) {
        exitCode = 1;
        process.stderr.write(
          `divergence: show ${showId} — dashboard total ${expected.total} vs show-map tile ${tileCount}\n`
        );
      }
    }

    if (exitCode === 0) {
      log('✔ all surfaces agree');
    } else {
      log('✘ divergence detected (see stderr)');
    }
  } catch (err) {
    process.stderr.write(`[setup] ${err.message}\n`);
    if (err.stack) process.stderr.write(`${err.stack}\n`);
    exitCode = 2;
  } finally {
    await browser.close();
  }
  process.exit(exitCode);
}

main();
