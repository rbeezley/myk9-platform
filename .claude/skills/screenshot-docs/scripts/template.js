/**
 * Documentation screenshot template — myk9-platform
 *
 * Usage:
 *   node .claude/skills/screenshot-docs/scripts/template.js
 *
 * Customize SHOTS array and sign-in credentials for your target guide section.
 */

const pw   = require('playwright');
const path = require('path');
const fs   = require('fs');

// ── Config ─────────────────────────────────────────────────────────────────
const BASE      = 'http://localhost:5173';
const SHOTS_DIR = path.join(__dirname, '../../../../docs/screenshots');
const TMP_DIR   = '/tmp/myk9-shots';

const CREDS = {
  // Change to the account for your guide section
  email: 'secretary@myk9t.com',
  pass:  'TestPass4567!',
};

const SHOW_ID = 'dededede-0000-0000-0000-000000000010'; // Heritage Scent Work

// Define shots to capture: { id, path, setup? }
// setup(page) is optional async fn called before screenshot
const SHOTS = [
  // Example:
  // {
  //   id:    'S-06',
  //   route: `/shows/${SHOW_ID}/setup`,
  //   setup: async (page) => {
  //     // any extra interactions before screenshotting
  //   },
  // },
];

// Viewport presets
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile:  { width: 390,  height: 844 },
  tablet:  { width: 768,  height: 1024 },
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function signIn(page, email, pass) {
  await page.goto(`${BASE}/sign-in`);
  await page.waitForLoadState('networkidle');

  const cred = page.locator('#credential');
  await cred.waitFor({ state: 'visible', timeout: 20000 });
  await cred.fill(email);
  await cred.press('Enter');

  const pw2 = page.locator('input[type="password"]:visible').first();
  await pw2.waitFor({ state: 'visible', timeout: 15000 });
  await pw2.fill(pass);
  await pw2.press('Enter');

  await page.waitForURL(u => !u.href.includes('/sign-in'), { timeout: 25000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

// Bypass the sidebar's aria-hidden overlay for nav clicks
async function sidebarClick(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`Sidebar element not found: ${selector}`);
  await page.evaluate(e => e.click(), el);
  await settle(page);
}

async function shoot(page, id) {
  const tmpPath  = path.join(TMP_DIR, `${id}.png`);
  const destPath = path.join(SHOTS_DIR, `${id}.png`);
  await page.screenshot({ path: tmpPath, fullPage: false });
  fs.copyFileSync(tmpPath, destPath);
  console.log(`  saved → docs/screenshots/${id}.png`);
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  if (SHOTS.length === 0) {
    console.error('No shots defined. Edit the SHOTS array in this script.');
    process.exit(1);
  }

  fs.mkdirSync(TMP_DIR, { recursive: true });

  const browser = await pw.chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const page    = await ctx.newPage();

  try {
    console.log(`Signing in as ${CREDS.email}…`);
    await signIn(page, CREDS.email, CREDS.pass);
    console.log('Signed in.\n');

    for (const shot of SHOTS) {
      console.log(`Capturing ${shot.id}…`);
      await page.goto(`${BASE}${shot.route}`);
      await settle(page);

      if (shot.setup) await shot.setup(page);

      await shoot(page, shot.id);
    }

    console.log('\nDone. Update docs/training/screenshot-shot-list.md status → ready.');
  } finally {
    await ctx.close();
    await browser.close();
  }
})().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
