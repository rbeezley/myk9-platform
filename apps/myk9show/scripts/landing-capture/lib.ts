// Shared helpers for capturing the landing page's timeline scenes from the running app
// (docs/plan-landing-animated-timeline.md, MYK9-1894, MYK9-2181).
//
// A capture runs against an isolated Supabase stack on this machine and nothing else. The
// rules are in guardRules.ts (pure, tested), wired to the browser in guard.ts. This file only
// launches the browser, signs a seeded account in, and measures.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { installGuard } from './guard.ts';
import type { Guard, JsonPatch } from './guard.ts';
import {
  ARMBAND_SELECTOR,
  assertLocalBackend,
  devServerOrigin,
  launchArgs,
  typeSecretChecked,
} from './guardRules.ts';
import { parseEnvFile, resolveAccounts } from '../../src/test/e2e-helpers/resetE2ePasswords.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = join(HERE, '..', '..');

export const BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:5173';
/** Throws here, before a browser exists, unless BASE is a dev server on this machine. */
export const DEV_ORIGIN = devServerOrigin(BASE);
/** Heartland Scent Work Classic, the canonical seed show. */
export const SHOW = 'dededede-0000-0000-0000-000000000010';

/** The app's env files, then the shell over them (the workflow sets the passwords there). */
function accountEnv(): Record<string, string | undefined> {
  const files = ['.env', '.env.local']
    .map(name => join(APP_DIR, name))
    .filter(file => existsSync(file))
    .map(file => parseEnvFile(readFileSync(file, 'utf8')));
  const shell = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value));
  return Object.assign({}, ...files, shell);
}

/** A seeded account, from the same roster the e2e suite signs in with (resolveAccounts). */
export type Role = 'secretary' | 'judge' | 'exhibitor';

export function launch(): Promise<Browser> {
  // Playwright's own Chromium by default; CAPTURE_CHANNEL=msedge uses an installed browser.
  return chromium.launch({
    channel: process.env.CAPTURE_CHANNEL || undefined,
    headless: true,
    // The browser itself resolves no name but this machine and the font hosts.
    args: launchArgs(),
  });
}

/**
 * A context with the guard installed before any page exists. Service workers are blocked:
 * a request a service worker makes does not pass through a context route.
 */
export async function guardedContext(
  browser: Browser,
  options: {
    viewport: { width: number; height: number };
    scale: number;
    patch?: JsonPatch | undefined;
  }
): Promise<{ ctx: BrowserContext; guard: Guard }> {
  const ctx = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: options.scale,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  // navigator.onLine follows a flag the run controls, and survives a reload.
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => sessionStorage.getItem('capture-offline') !== '1',
    });
  });
  const guard = await installGuard(ctx, { devOrigin: DEV_ORIGIN, patch: options.patch });
  return { ctx, guard };
}

/**
 * Sign a seeded account in. The password is typed only after the page has loaded with no
 * request to a hosted project, and the sign-in request itself goes through the guard, so it
 * can only reach a stack on this machine.
 */
export async function signIn(page: Page, guard: Guard, role: Role): Promise<void> {
  // Throws, naming the variable, when the role's password is not set.
  const [account] = resolveAccounts(accountEnv(), [role]);
  if (!account) throw new Error(`No seeded account for ${role}`);
  const { email, password } = account;
  await page.goto(`${BASE}/sign-in`);
  const credential = page.locator('#credential');
  await credential.waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page, 1000);
  const backendOrigin = () =>
    page.locator('meta[name="myk9-supabase-origin"]').getAttribute('content', { timeout: 5000 });
  // Before the address is entered too: submitting it already asks the backend about it.
  guard.assertIsolated();
  assertLocalBackend(await backendOrigin());
  await credential.fill(email);
  await credential.press('Enter');
  const pw = page.locator('input[type="password"]:visible').first();
  await pw.waitFor({ state: 'visible', timeout: 15_000 });
  await typeSecretChecked({
    assertIsolated: guard.assertIsolated,
    backendOrigin,
    type: async () => {
      await pw.fill(password);
      await pw.press('Enter');
    },
  });
  await page
    .waitForURL(u => !u.href.includes('/sign-in'), { timeout: 30_000 })
    .catch((err: unknown) => {
      // A stopped run names the request that stopped it instead of a timeout.
      guard.assertIsolated();
      throw err;
    });
  await settle(page, 2000);
  guard.assertIsolated();
}

async function setOnline(page: Page, online: boolean): Promise<void> {
  await page.evaluate(on => {
    if (on) sessionStorage.removeItem('capture-offline');
    else sessionStorage.setItem('capture-offline', '1');
    window.dispatchEvent(new Event(on ? 'online' : 'offline'));
  }, online);
}

/** Cut the browser off from the backend entirely and tell the app it is offline. */
export async function goOffline(page: Page, guard: Guard): Promise<void> {
  guard.setCutOff(true);
  await setOnline(page, false);
}

/** Let reads through again and tell the app it is back online. Writes stay refused. */
export async function goOnline(page: Page, guard: Guard): Promise<void> {
  guard.setCutOff(false);
  await setOnline(page, true);
}

export async function settle(page: Page, ms: number): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The bounding box of an element in page pixels, for a ring. Climbs to the first ancestor at
 * least `minW` by `minH`, so a label can stand for the block it sits in.
 */
export async function box(loc: Locator, minW = 0, minH = 0): Promise<Box> {
  const handle = await loc.first().elementHandle({ timeout: 8000 });
  if (!handle) throw new Error(`Nothing to measure for ${loc}`);
  return handle.evaluate(
    (el, [w, h]) => {
      let n = el as HTMLElement;
      while (n.parentElement && (n.offsetWidth < w! || n.offsetHeight < h!)) n = n.parentElement;
      const r = n.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    },
    [minW, minH]
  );
}

/** Visible text of the page, one line per rendered line. */
export function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

/** The text of every visible element that shows an armband (data-testid ending "armband"). */
export function armbandLabels(page: Page): Promise<string[]> {
  return page
    .locator(`${ARMBAND_SELECTOR}:visible`)
    .evaluateAll(els => els.map(el => (el as HTMLElement).innerText));
}

/** Visible text of the page on one line, for the run's log. */
export async function pageText(page: Page, max: number): Promise<string> {
  return (await visibleText(page))
    .split(/\s*[\r\n]+\s*/)
    .join(' | ')
    .slice(0, max);
}

/** What the guard kept in the browser, for the end of the run's log. */
export function logGuard(guard: Guard): void {
  const list = (items: string[]) => [...new Set(items)].join(', ') || 'none';
  console.log('refused writes ::', list(guard.refused));
  console.log('blocked hosts ::', list(guard.blocked));
  console.log('sockets held in the browser ::', list(guard.heldSockets));
}
