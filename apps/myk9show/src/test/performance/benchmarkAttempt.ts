import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { type BenchmarkRole, type BenchmarkRoute } from './benchmarkRoutes';
import { blockedRouteReason } from './benchmarkMetrics';
import { readBrowserMetrics } from './browserMetrics';
import { AUDIT_READ_ONLY_RPCS } from '../e2e/helpers/sharedStagingWriteGuard';
import { type BenchmarkSample, type NetworkProfile } from './benchmarkReport';

type Sample = BenchmarkSample;

const appRoot = process.cwd();
const env = { ...loadEnv('development', appRoot, ''), ...process.env };
const origin = process.env.MYK9_PERF_BASE_URL ?? 'http://127.0.0.1:4173';
const supabaseUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const maxNavigationMs = Number(process.env.MYK9_PERF_NAVIGATION_TIMEOUT_MS ?? 25_000);
const maxReadyMs = Number(process.env.MYK9_PERF_READY_TIMEOUT_MS ?? 30_000);
// The additional admin checks are STABLE in migrations 156 and 124.
const readOnlyRpcNames = new Set([...AUDIT_READ_ONLY_RPCS, 'is_site_admin', 'is_platform_admin']);

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

async function configureContext(
  context: BrowserContext,
  profile: NetworkProfile,
  role: BenchmarkRole
): Promise<Page> {
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
  if (role !== 'public')
    await page.route('**/*', async route => {
      const request = route.request();
      const method = request.method();
      const url = request.url();
      const isSafe = ['GET', 'HEAD', 'OPTIONS'].includes(method);
      const isAuthRefresh = Boolean(
        supabaseUrl && url.startsWith(supabaseUrl) && url.includes('/auth/v1/token')
      );
      const isReadOnlyRoleRpc = Boolean(
        method === 'POST' &&
        supabaseUrl &&
        url.startsWith(`${supabaseUrl}/rest/v1/rpc/`) &&
        readOnlyRpcNames.has(new URL(url).pathname.split('/').at(-1) ?? '')
      );
      if (isSafe || isAuthRefresh || isReadOnlyRoleRpc) await route.continue();
      else await route.abort('blockedbyclient');
    });

  if (profile !== 'secretary-desktop') {
    await page.setViewportSize({ width: 390, height: 844 });
  } else {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  if (profile === 'fast-4g-mobile') {
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
  return page;
}

export async function measure(
  context: BrowserContext,
  route: BenchmarkRoute,
  profile: NetworkProfile,
  cache: 'cold' | 'warm',
  repeat: number
): Promise<Sample> {
  const page = await configureContext(context, profile, route.role);
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
  page.on('requestfinished', async request => {
    if (!supabaseUrl || !request.url().startsWith(supabaseUrl)) return;
    const response = await request.response();
    if (response) {
      const timing = response.request().timing();
      requestDurations.push({
        path: new URL(request.url()).pathname,
        durationMs: timing.responseEnd,
      });
    }
  });
  const target = new URL(route.path, origin);
  const start = performance.now();
  let usableAt = start;
  try {
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: maxNavigationMs });
    await page
      .locator(route.readySelector)
      .first()
      .waitFor({ state: 'visible', timeout: maxReadyMs });
    usableAt = performance.now();
    await page.waitForTimeout(500);
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
    jsTransferBytes: metrics.jsTransferBytes,
    jsChunks: metrics.jsChunks,
    requestCount: metrics.requestCount,
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
      { ...blocked, cache: 'warm', reason: `Warm run not attempted: ${blocked.reason}` },
    ];
  }
  return runWithSession(route, profile, repeat, session);
}

async function runWithSession(
  route: BenchmarkRoute,
  profile: NetworkProfile,
  repeat: number,
  session: Session | null
): Promise<[Sample, Sample]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: storageFor(session) });
    try {
      const cold = await measure(context, route, profile, 'cold', repeat);
      const warm =
        cold.status === 'measured'
          ? await measure(context, route, profile, 'warm', repeat)
          : { ...cold, cache: 'warm' as const, reason: `Warm run not attempted: ${cold.reason}` };
      return [cold, warm];
    } finally {
      await context.close().catch(() => undefined);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}
