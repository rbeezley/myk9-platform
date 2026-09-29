import { chromium, type BrowserContext } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { type BenchmarkRole, type BenchmarkRoute } from './benchmarkRoutes';
import { blockedRouteReason } from './benchmarkMetrics';
import { readBrowserMetrics } from './browserMetrics';
import { waitForRouteReady } from './benchmarkReadiness';
import { benchmarkRequestDisposition } from './benchmarkNetworkPolicy';
import { observeNetwork } from './benchmarkNetworkObservation';
import { readSupabaseRequestDuration } from './benchmarkRequestTiming';
import { type BenchmarkSample, type NetworkProfile } from './benchmarkReport';

type Sample = BenchmarkSample;

const appRoot = process.cwd();
const env = { ...loadEnv('development', appRoot, ''), ...process.env };
const origin = process.env.MYK9_PERF_BASE_URL ?? 'http://127.0.0.1:4173';
const supabaseUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const maxNavigationMs = Number(process.env.MYK9_PERF_NAVIGATION_TIMEOUT_MS ?? 25_000);
const maxReadyMs = Number(process.env.MYK9_PERF_READY_TIMEOUT_MS ?? 60_000);

const credentials: Partial<Record<BenchmarkRole, { email?: string; password?: string }>> = {
  secretary: { email: env.E2E_SECRETARY_EMAIL, password: env.E2E_SECRETARY_PASSWORD },
  exhibitor: { email: env.E2E_DEMO_EXHIBITOR_EMAIL, password: env.E2E_DEMO_EXHIBITOR_PASSWORD },
  judge: { email: env.E2E_JUDGE_EMAIL, password: env.E2E_JUDGE_PASSWORD },
  admin: { email: env.E2E_ADMIN_EMAIL, password: env.E2E_ADMIN_PASSWORD },
};

export async function signIn(role: Exclude<BenchmarkRole, 'public'>): Promise<Session | null> {
  const credential = credentials[role];
  if (!supabaseUrl || !anonKey || !credential?.email || !credential.password) return null;
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8_000) }),
    },
  });
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: credential.email,
      password: credential.password,
    });
    if (error) return null;
    return data.session;
  } catch {
    return null;
  }
}

function storageFor(session: Session | null):
  | {
      cookies: never[];
      origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
    }
  | undefined {
  if (!session || !supabaseUrl) return undefined;
  const project = new URL(supabaseUrl).hostname.split('.')[0];
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [{ name: `sb-${project}-auth-token`, value: JSON.stringify(session) }],
      },
    ],
  };
}

async function configureContext(context: BrowserContext, profile: NetworkProfile, throttle = true) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(10_000);
    (window as Window & { __benchLcp?: number }).__benchLcp = 0;
    (window as Window & { __benchTbt?: number }).__benchTbt = 0;
    (window as Window & { __benchCls?: number | null }).__benchCls = null;
    try {
      new PerformanceObserver(list => {
        const latest = list.getEntries().at(-1);
        if (latest) (window as Window & { __benchLcp?: number }).__benchLcp = latest.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => {
        const current = (window as Window & { __benchTbt?: number }).__benchTbt ?? 0;
        (window as Window & { __benchTbt?: number }).__benchTbt =
          current +
          list.getEntries().reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0);
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // Older browser engines can omit the LCP observer; the report keeps it null.
    }
    try {
      let sessionStart = 0;
      let sessionLast = 0;
      let sessionValue = 0;
      (window as Window & { __benchCls?: number | null }).__benchCls = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries() as Array<
          PerformanceEntry & { hadRecentInput: boolean; value: number }
        >) {
          if (entry.hadRecentInput) continue;
          if (
            sessionStart === 0 ||
            entry.startTime - sessionLast > 1000 ||
            entry.startTime - sessionStart > 5000
          ) {
            sessionStart = entry.startTime;
            sessionValue = 0;
          }
          sessionLast = entry.startTime;
          sessionValue += entry.value;
          const state = window as Window & { __benchCls?: number | null };
          state.__benchCls = Math.max(state.__benchCls ?? 0, sessionValue);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      (window as Window & { __benchCls?: number | null }).__benchCls = null;
    }
  });
  await page.route('**/*', async route => {
    const request = route.request();
    const disposition = benchmarkRequestDisposition(request.method(), request.url(), supabaseUrl);
    if (disposition === 'continue') await route.continue();
    else if (disposition === 'acknowledge') await route.fulfill({ status: 204 });
    else await route.abort('blockedbyclient');
  });

  if (profile !== 'secretary-desktop') {
    await page.setViewportSize({ width: 390, height: 844 });
  } else {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const networkSummary = observeNetwork(cdp, supabaseUrl);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  if (!throttle) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 20,
      downloadThroughput: 25_000_000 / 8,
      uploadThroughput: 5_000_000 / 8,
      connectionType: 'ethernet',
    });
  } else if (profile === 'fast-4g-mobile') {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 40,
      downloadThroughput: 5_000_000 / 8,
      uploadThroughput: 1_000_000 / 8,
      connectionType: 'cellular4g',
    });
  } else if (profile === 'slow-4g-mobile') {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
      connectionType: 'cellular4g',
    });
  } else {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 20,
      downloadThroughput: 25_000_000 / 8,
      uploadThroughput: 5_000_000 / 8,
      connectionType: 'ethernet',
    });
  }
  return { page, networkSummary };
}

export async function measure(
  context: BrowserContext,
  route: BenchmarkRoute,
  profile: NetworkProfile,
  cache: 'cold' | 'warm',
  repeat: number,
  primedReplicationRows = 0
): Promise<Sample> {
  const { page, networkSummary } = await configureContext(context, profile);
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('pageerror', error => {
    if (pageErrors.length < 3) pageErrors.push(error.message.slice(0, 180));
  });
  page.on('requestfailed', request => {
    if (failedRequests.length < 5)
      failedRequests.push(
        `${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? 'failed'}`
      );
  });
  const requestDurations: Array<{ path: string; durationMs: number }> = [];
  page.on('requestfinished', request => {
    void readSupabaseRequestDuration(request, supabaseUrl).then(duration => {
      if (duration) requestDurations.push(duration);
    });
  });
  const target = new URL(route.path, origin);
  const start = performance.now();
  let usableAt = start;
  try {
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: maxNavigationMs });
    usableAt = await waitForRouteReady(page, route, maxReadyMs);
    await page.waitForTimeout(500);
    if (cache === 'warm' && !(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
      throw new Error('Warm navigation was not controlled by the service worker');
    }
  } catch (error) {
    const pageState = await page
      .evaluate(() => ({
        title: document.title,
        accessDenied: document.body.innerText.includes("You don't have access"),
        headings: Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
          .map(element => element.textContent?.trim())
          .filter(Boolean)
          .slice(0, 4),
        statuses: Array.from(document.querySelectorAll('[role="status"], [role="alert"]'))
          .map(element => element.textContent?.trim())
          .filter(Boolean)
          .slice(0, 3),
        documentLength: document.documentElement.outerHTML.length,
        readyState: document.readyState,
      }))
      .catch(() => ({
        title: '',
        accessDenied: false,
        headings: [] as string[],
        statuses: [] as string[],
        documentLength: 0,
        readyState: 'unknown',
      }));
    const diagnostic = [
      pageState.accessDenied ? 'access denied state' : '',
      pageState.title,
      ...pageState.headings,
      ...pageState.statuses,
      `document ${pageState.documentLength} chars, ${pageState.readyState}`,
      ...pageErrors.map(message => `page error: ${message}`),
      ...failedRequests.map(message => `failed request: ${message}`),
    ]
      .filter(Boolean)
      .join(' / ');
    const blocked: Sample = {
      routeId: route.id,
      role: route.role,
      path: route.path,
      profile,
      cache,
      repeat,
      status: 'blocked',
      reason: blockedRouteReason(
        target.pathname,
        new URL(page.url()).pathname,
        `${error instanceof Error ? error.message.split('\n')[0] : 'Navigation failed'}${diagnostic ? `; page: ${diagnostic}` : ''}`
      ),
      finalPath: new URL(page.url()).pathname,
    };
    await page.close().catch(() => undefined);
    console.log(`Blocked ${route.id} (${profile}/${cache}): ${blocked.reason}`);
    return blocked;
  }
  const metrics = await readBrowserMetrics(page);
  const transfer = networkSummary();
  if (cache === 'warm' && transfer.serviceWorkerScripts === 0) {
    await page.close();
    return {
      routeId: route.id,
      role: route.role,
      path: route.path,
      profile,
      cache,
      repeat,
      status: 'blocked',
      reason: 'Warm navigation transferred no scripts from the service worker',
    };
  }
  if (new URL(page.url()).pathname !== target.pathname) {
    const blocked: Sample = {
      routeId: route.id,
      role: route.role,
      path: route.path,
      profile,
      cache,
      repeat,
      status: 'blocked',
      reason: `Redirected to ${new URL(page.url()).pathname}; expected route not reached`,
      finalPath: new URL(page.url()).pathname,
    };
    await page.close().catch(() => undefined);
    console.log(`Blocked ${route.id} (${profile}/${cache}): redirected to ${blocked.finalPath}`);
    return blocked;
  }
  await page.close();
  const sample: Sample = {
    routeId: route.id,
    role: route.role,
    path: route.path,
    profile,
    cache,
    repeat,
    status: 'measured',
    finalPath: new URL(page.url()).pathname,
    title: metrics.title,
    heading: metrics.heading,
    timeToUsableMs: usableAt - start,
    ttfbMs: metrics.ttfbMs ?? undefined,
    lcpMs: metrics.lcpMs,
    cls: metrics.cls,
    tbtProxyMs: metrics.tbtProxyMs,
    jsTransferBytes: transfer.jsTransferBytes,
    jsChunks: transfer.jsChunks,
    requestCount: transfer.requestCount,
    warmEvidence:
      cache === 'warm'
        ? {
            serviceWorkerScripts: transfer.serviceWorkerScripts,
            replicationRows: primedReplicationRows,
          }
        : undefined,
    slowestSupabase: requestDurations.sort((a, b) => b.durationMs - a.durationMs).slice(0, 3),
  };
  console.log(
    `Measured ${route.id} (${profile}/${cache}): ${sample.timeToUsableMs?.toFixed(0)} ms usable`
  );
  return sample;
}

export async function measurePair(
  route: BenchmarkRoute,
  profile: NetworkProfile,
  repeat: number,
  session: Session | null
): Promise<[Sample, Sample]> {
  if (route.role !== 'public' && !session) {
    const blocked: Sample = {
      routeId: route.id,
      role: route.role,
      path: route.path,
      profile,
      cache: 'cold',
      repeat,
      status: 'blocked',
      reason: 'Configured E2E role sign-in was unavailable',
    };
    return [
      blocked,
      { ...blocked, cache: 'warm', reason: `Second pass not attempted: ${blocked.reason}` },
    ];
  }
  return runWithSession(route, profile, repeat, session);
}

/** Prime the same route with an activated precache and its local persistent data. */
async function primeWarmContext(
  context: BrowserContext,
  route: BenchmarkRoute,
  profile: NetworkProfile
): Promise<number> {
  const { page } = await configureContext(context, profile, false);
  try {
    await page.goto(new URL(route.path, origin).href, {
      waitUntil: 'domcontentloaded',
      timeout: maxNavigationMs,
    });
    await waitForRouteReady(page, route, maxReadyMs);
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active, null, {
      timeout: 90_000,
    });
    return await page.evaluate(async () => {
      if (!(await caches.keys()).some(key => key.startsWith('workbox-precache'))) {
        throw new Error('Service-worker precache did not become available');
      }
      if (!(await indexedDB.databases()).some(db => db.name === 'myK9_Replication')) return 0;
      const request = indexedDB.open('myK9_Replication');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const stores = Array.from(db.objectStoreNames);
      const counts = await Promise.all(
        stores.map(
          name =>
            new Promise<number>(resolve => {
              const count = db.transaction(name, 'readonly').objectStore(name).count();
              count.onsuccess = () => resolve(count.result);
              count.onerror = () => resolve(0);
            })
        )
      );
      db.close();
      return counts.reduce((sum, value) => sum + value, 0);
    });
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function runWithSession(
  route: BenchmarkRoute,
  profile: NetworkProfile,
  repeat: number,
  session: Session | null
): Promise<[Sample, Sample]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const coldContext = await browser.newContext({
      storageState: storageFor(session),
      serviceWorkers: 'block',
    });
    let cold: Sample;
    try {
      // Presence and live-sync channels can send writes outside Playwright's HTTP route.
      await coldContext.routeWebSocket('**/*', webSocket => webSocket.close());
      cold = await measure(coldContext, route, profile, 'cold', repeat);
    } finally {
      await coldContext.close().catch(() => undefined);
    }
    const warmContext = await browser.newContext({
      storageState: storageFor(session),
      serviceWorkers: 'allow',
    });
    try {
      await warmContext.routeWebSocket('**/*', webSocket => webSocket.close());
      const replicationRows = await primeWarmContext(warmContext, route, profile);
      return [cold, await measure(warmContext, route, profile, 'warm', repeat, replicationRows)];
    } catch (error) {
      return [
        cold,
        {
          routeId: route.id,
          role: route.role,
          path: route.path,
          profile,
          cache: 'warm',
          repeat,
          status: 'blocked',
          reason: `Warm priming failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ];
    } finally {
      await warmContext.close().catch(() => undefined);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}
