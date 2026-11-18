// Shared helpers for capturing the landing page's timeline scenes from the running app
// (docs/plan-landing-animated-timeline.md, MYK9-1894).
//
// A capture run must never change shared data. Four rules, all enforced here:
//   1. Only a local dev server is driven (CAPTURE_BASE_URL must be localhost).
//   2. Every request to any origin but that dev server is refused unless it is a read
//      (guardRules.ts). RPCs are POSTs and some write (opening a ringside scoresheet calls
//      ringside_update_entry), so "/rpc/" is never exempt as a whole.
//   3. Nothing at all goes to the production project unless the shell running the capture
//      sets MYK9_ALLOW_PROD_E2E=1, the opt-in src/test/productionFixtureGuard.ts asks of a
//      Playwright run (MYK9-1454): a fixture sign-in runs a full sync on the live database.
//      The host is read from the requests the app really makes, not from an env file.
//   4. A state the seed data does not hold is staged by changing what the browser is shown
//      (a patched response, or a staged answer to a refused write), never by writing it.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, Locator, Page, Route } from '@playwright/test';
import {
  isProductionHost,
  isReadMethod,
  isReadRequest,
  rangeHeaders,
  rpcName,
} from './guardRules.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = join(HERE, '..', '..');

export const BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:5173';
/** Heartland Scent Work Classic, the canonical seed show. */
export const SHOW = 'dededede-0000-0000-0000-000000000010';

const BASE_URL = new URL(BASE);
if (!['localhost', '127.0.0.1', '[::1]'].includes(BASE_URL.hostname)) {
  throw new Error(`Capture runs drive a local dev server only; CAPTURE_BASE_URL is ${BASE}`);
}
const PRODUCTION_ALLOWED = process.env.MYK9_ALLOW_PROD_E2E === '1';
const PRODUCTION_REFUSAL =
  'Capture: nothing was sent, because the dev server points at the production project. ' +
  'Point VITE_SUPABASE_URL at an isolated stack (pnpm qa:isolated-e2e:prepare) and restart ' +
  'the dev server, or set MYK9_ALLOW_PROD_E2E=1 in the shell for this run.';

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ['.env', '.env.local']) {
    const file = join(APP_DIR, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const ENV = loadEnv();

export type Role = 'secretary' | 'judge' | 'exhibitor';
const CREDENTIALS: Record<Role, { email: string; password: string }> = {
  secretary: { email: 'E2E_SECRETARY_EMAIL', password: 'E2E_SECRETARY_PASSWORD' },
  judge: { email: 'E2E_JUDGE_EMAIL', password: 'E2E_JUDGE_PASSWORD' },
  exhibitor: { email: 'E2E_DEMO_EXHIBITOR_EMAIL', password: 'E2E_DEMO_EXHIBITOR_PASSWORD' },
};

export function launch(): Promise<Browser> {
  // Playwright's own Chromium by default; CAPTURE_CHANNEL=msedge uses an installed browser.
  return chromium.launch({ channel: process.env.CAPTURE_CHANNEL || undefined, headless: true });
}

export type Guard = {
  /** Writes that were refused, for the run's log. An unexpected name here is worth reading. */
  refused: string[];
  /**
   * Sign a seeded account in. Throws, with nothing sent, when the backend is the production
   * project and the run has not opted in.
   */
  signIn(page: Page, role: Role): Promise<void>;
  /** Cut the browser off from the backend entirely and tell the app it is offline. */
  goOffline(page: Page): Promise<void>;
  /** Let reads through again and tell the app it is back online. Writes stay refused. */
  goOnline(page: Page): Promise<void>;
  /**
   * Answer one write RPC inside the browser, as if the server had accepted it. `answer` gets
   * the arguments the app sent and returns the JSON the app receives; the request never
   * leaves the machine.
   */
  stageRpcAnswer(name: string, answer: (args: unknown) => unknown): void;
};

/** Rewrites the rows of the reads whose path matches `paths`; every other read is untouched. */
export type JsonPatch = { paths: RegExp; rows: (body: unknown) => unknown };

/**
 * A count probe is a HEAD with no body to patch. Read the same rows with a GET, run them
 * through the patch, and report the count the patched list would have.
 */
async function patchedCount(route: Route, url: URL, rows: JsonPatch['rows']) {
  const rowsUrl = new URL(url);
  rowsUrl.searchParams.set('select', '*');
  const [res, all] = await Promise.all([
    route.fetch(),
    route.fetch({ url: rowsUrl.toString(), method: 'GET' }),
  ]);
  const before: unknown = await all.json().catch(() => null);
  return route.fulfill({
    response: res,
    headers: rangeHeaders(res.headers(), before, rows(before)),
  });
}

/**
 * Install the write guard on a context. `patch`, when given, rewrites the JSON of the reads
 * it names, which is how a state is staged without writing it.
 */
export async function guardBackend(ctx: BrowserContext, patch?: JsonPatch): Promise<Guard> {
  let cutOff = false;
  let productionRefused = false;
  const staged = new Map<string, (args: unknown) => unknown>();
  const refused: string[] = [];

  // navigator.onLine follows a flag the run controls, and survives a reload.
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => sessionStorage.getItem('capture-offline') !== '1',
    });
  });

  // Everything but the dev server itself, so a Supabase stack on 127.0.0.1 is guarded too.
  await ctx.route(
    url => url.origin !== BASE_URL.origin,
    async (route: Route) => {
      const req = route.request();
      const url = new URL(req.url());
      const method = req.method();

      if (isProductionHost(url.hostname) && !PRODUCTION_ALLOWED) {
        productionRefused = true;
        return route.abort('blockedbyclient');
      }

      const rpc = rpcName(url.pathname);
      const answer = rpc ? staged.get(rpc) : undefined;
      if (answer && !isReadMethod(method)) {
        // Answered here: the request never leaves the machine.
        return route.fulfill({ status: 200, json: answer(req.postDataJSON()) });
      }
      if (cutOff) return route.abort('internetdisconnected');

      if (!isReadRequest(method, url.pathname)) {
        refused.push(`${method} ${url.pathname}`);
        return route.abort('failed');
      }
      if (!patch || !url.pathname.startsWith('/rest/v1/') || !patch.paths.test(url.pathname)) {
        return route.fallback();
      }

      if (method === 'HEAD') {
        return patchedCount(route, url, patch.rows).catch(() => route.abort('failed'));
      }
      let res;
      try {
        res = await route.fetch();
      } catch {
        return route.abort('failed');
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return route.fulfill({ response: res });
      }
      const patched = patch.rows(body);
      return route.fulfill({
        response: res,
        json: patched,
        headers: rangeHeaders(res.headers(), body, patched),
      });
    }
  );

  const setOnline = (page: Page, online: boolean) =>
    page.evaluate(on => {
      if (on) sessionStorage.removeItem('capture-offline');
      else sessionStorage.setItem('capture-offline', '1');
      window.dispatchEvent(new Event(on ? 'online' : 'offline'));
    }, online);

  return {
    refused,
    async signIn(page, role) {
      const keys = CREDENTIALS[role];
      const email = ENV[keys.email];
      const password = ENV[keys.password];
      if (!email || !password) {
        throw new Error(`${keys.email} / ${keys.password} are not set in apps/myk9show/.env`);
      }
      await page.goto(`${BASE}/sign-in`);
      const credential = page.locator('#credential');
      await credential.waitFor({ state: 'visible', timeout: 30_000 });
      await credential.fill(email);
      await credential.press('Enter');
      const pw = page.locator('input[type="password"]:visible').first();
      await pw.waitFor({ state: 'visible', timeout: 15_000 });
      await pw.fill(password);
      await pw.press('Enter');
      await page
        .waitForURL(u => !u.href.includes('/sign-in'), { timeout: 30_000 })
        .catch((err: unknown) => {
          // The guard dropped the sign-in request itself, so the page never left /sign-in.
          throw productionRefused ? new Error(PRODUCTION_REFUSAL) : err;
        });
      await settle(page, 2000);
    },
    async goOffline(page) {
      cutOff = true;
      await setOnline(page, false);
    },
    async goOnline(page) {
      cutOff = false;
      await setOnline(page, true);
    },
    stageRpcAnswer(name, answer) {
      staged.set(name, answer);
    },
  };
}

export async function settle(page: Page, ms = 2500): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The bounding box of an element in page pixels, for a zoom region or a ring. Climbs to the
 * first ancestor at least `minW` by `minH`, so a label can stand for the card it sits in.
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

/** Visible text of the page on one line, for the run's log. */
export async function pageText(page: Page, max = 600): Promise<string> {
  return (await visibleText(page))
    .split(/\s*[\r\n]+\s*/)
    .join(' | ')
    .slice(0, max);
}
