import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { benchmarkRoutesFor, type BenchmarkRole, type BenchmarkRoute } from './benchmarkRoutes';
import { blockedRouteReason } from './benchmarkMetrics';
import { readCompletedSamples } from './benchmarkResume';
import { chunkInventory, readBrowserMetrics } from './browserMetrics';
import { AUDIT_READ_ONLY_RPCS } from '../e2e/helpers/sharedStagingWriteGuard';
import {
  formatBenchmarkReport,
  type BenchmarkSample,
  type NetworkProfile,
} from './benchmarkReport';

type Sample = BenchmarkSample;

const appRoot = process.cwd();
const repoRoot = resolve(appRoot, '../..');
const env = { ...loadEnv('development', appRoot, ''), ...process.env };
const origin = process.env.MYK9_PERF_BASE_URL ?? 'http://127.0.0.1:4173';
const supabaseUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const showId =
  process.env.MYK9_PERF_SHOW_ID ??
  env.QA_SECRETARY_SHOW_ID ??
  'dededede-0000-0000-0000-000000000010';
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

function asAuthRole(role: BenchmarkRole): role is Exclude<BenchmarkRole, 'public'> {
  return role !== 'public';
}

function authenticatedRoles(routes: readonly BenchmarkRoute[]): Exclude<BenchmarkRole, 'public'>[] {
  return routes
    .map(route => route.role)
    .filter((role): role is Exclude<BenchmarkRole, 'public'> => role !== 'public');
}

async function signIn(role: Exclude<BenchmarkRole, 'public'>): Promise<Session | null> {
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

async function measure(
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

async function main(): Promise<void> {
  if (!supabaseUrl || !anonKey)
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
  const routes = benchmarkRoutesFor(showId);
  const requestedRoutes = process.env.MYK9_PERF_ROUTES
    ? routes.filter(route => process.env.MYK9_PERF_ROUTES?.split(',').includes(route.id))
    : routes;
  const excluded = new Set(process.env.MYK9_PERF_EXCLUDE_ROUTES?.split(',') ?? []);
  const selectedRoutes = requestedRoutes.filter(route => !excluded.has(route.id));
  if (selectedRoutes.length === 0)
    throw new Error('MYK9_PERF_ROUTES did not match any configured route ids.');
  const repeats = Number(process.env.MYK9_PERF_REPEATS ?? 3);
  if (!Number.isInteger(repeats) || repeats < 1)
    throw new Error('MYK9_PERF_REPEATS must be a positive integer.');
  if (!Number.isFinite(maxReadyMs) || maxReadyMs <= 0)
    throw new Error('MYK9_PERF_READY_TIMEOUT_MS must be a positive number.');
  const selectedRoles = [...new Set(authenticatedRoles(selectedRoutes))];
  const sessions: Partial<Record<Exclude<BenchmarkRole, 'public'>, Session | null>> = {};
  const authenticated = await Promise.all(selectedRoles.map(role => signIn(role)));
  selectedRoles.forEach((role, index) => {
    sessions[role] = authenticated[index];
    console.log(
      authenticated[index]
        ? `Authenticated role: ${role}`
        : `Role unavailable: ${role} (sign-in credentials or auth service)`
    );
  });

  const output = resolve(repoRoot, 'docs/qa/perf-baseline-2026-09-26.md');
  mkdirSync(resolve(repoRoot, 'docs/qa'), { recursive: true });
  const samples: Sample[] =
    process.env.MYK9_PERF_RESUME === '1' ? readCompletedSamples(output, routes) : [];
  const resumedFromCrash = samples.length > 0;
  const browser = await chromium.launch({ headless: true });
  const chunks = chunkInventory(appRoot);
  const persist = () =>
    writeFileSync(
      output,
      formatBenchmarkReport(samples, chunks, {
        origin,
        showId,
        buildRef: env.VERCEL_GIT_COMMIT_SHA ?? 'local worktree',
        routeCount: routes.length,
        readyTimeoutMs: maxReadyMs,
        resumedFromCrash,
      })
    );
  try {
    for (const route of selectedRoutes) {
      const profiles: NetworkProfile[] =
        route.role === 'secretary'
          ? ['fast-4g-mobile', 'slow-4g-mobile', 'secretary-desktop']
          : ['fast-4g-mobile', 'slow-4g-mobile'];
      const selectedProfiles = process.env.MYK9_PERF_PROFILES
        ? profiles.filter(profile => process.env.MYK9_PERF_PROFILES?.split(',').includes(profile))
        : profiles;
      if (selectedProfiles.length === 0) {
        throw new Error(`MYK9_PERF_PROFILES did not select a profile for ${route.id}.`);
      }
      if (
        selectedProfiles.every(profile =>
          Array.from({ length: repeats }, (_, index) => index + 1).every(repeat =>
            (['cold', 'warm'] as const).every(cache =>
              samples.some(
                sample =>
                  sample.routeId === route.id &&
                  sample.profile === profile &&
                  sample.repeat === repeat &&
                  sample.cache === cache
              )
            )
          )
        )
      ) {
        console.log(`Restored completed route: ${route.id}`);
        continue;
      }
      if (asAuthRole(route.role) && !sessions[route.role]) {
        for (const profile of selectedProfiles) {
          for (let repeat = 1; repeat <= repeats; repeat++) {
            for (const cache of ['cold', 'warm'] as const)
              samples.push({
                routeId: route.id,
                role: route.role,
                path: route.path,
                profile,
                cache,
                repeat,
                status: 'blocked',
                reason: 'Configured E2E role sign-in was unavailable',
              });
          }
        }
        continue;
      }
      for (const profile of selectedProfiles) {
        for (let repeat = 1; repeat <= repeats; repeat++) {
          const context = await browser.newContext({
            storageState: storageFor(
              route.role === 'public' ? null : (sessions[route.role] ?? null)
            ),
          });
          try {
            const cold = await measure(context, route, profile, 'cold', repeat).catch(error => {
              const reason =
                error instanceof Error ? error.message.split('\n')[0] : 'Browser failed';
              console.log(`Blocked ${route.id} (${profile}/cold): ${reason}`);
              return {
                routeId: route.id,
                role: route.role,
                path: route.path,
                profile,
                cache: 'cold' as const,
                repeat,
                status: 'blocked' as const,
                reason,
              };
            });
            samples.push(cold);
            if (cold.status === 'measured') {
              samples.push(await measure(context, route, profile, 'warm', repeat));
            } else {
              samples.push({
                ...cold,
                cache: 'warm',
                reason: `Warm run not attempted: ${cold.reason}`,
              });
            }
          } finally {
            await context.close().catch(() => undefined);
            persist();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  persist();
  const blocked = samples.filter(sample => sample.status === 'blocked').length;
  console.log(`Baseline written: ${output}`);
  console.log(
    `Routes measured: ${samples.length - blocked}/${samples.length}; blocked: ${blocked}`
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Performance baseline failed');
  process.exitCode = 1;
});
