import type { Page, TestInfo, test as PlaywrightTest } from '@playwright/test';
import { collectSecrets, scrubSecrets } from '../../../utils/scrubArtifactSecrets';

/**
 * MYK9-1114: failure diagnostics for specs whose red leaves nothing to read.
 *
 * The regression run excludes Playwright traces from its uploaded artifact (MYK9-1057: a trace
 * records the typed sign-in password), and the production build hides error messages, so a page
 * that lands on an error boundary or a toast that parks a write left no evidence at all. This
 * collects console, page-error, failed-request and failed-asset facts while the test runs and,
 * only when the test did not end as expected, attaches ONE plain-text `browser-diagnostics`
 * attachment. The HTML report inlines it, and the `playwright-report-ci` folders are what CI uploads.
 *
 * No request or response bodies and no headers are ever read. Every URL is logged without its
 * query string or fragment, and the finished text is redacted before it leaves this module.
 */

const MAX_ENTRIES = 200;
const MAX_TEXT = 2_000;
const MAX_REGION_TEXT = 4_000;
const SNAPSHOT_TIMEOUT_MS = 5_000;

/** Console lines worth keeping at any level: the failure modes this exists to explain. */
const INTERESTING_CONSOLE =
  /LoadingErrorBoundary|caught an error|Failed to fetch dynamically imported module|chunk/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Drops the query string and fragment from one URL. Never throws. */
export function stripUrlQuery(url: string): string {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin === 'null' ? parsed.protocol : parsed.origin;
    return origin + parsed.pathname;
  } catch {
    return url.replace(/[?#].*$/, '');
  }
}

/**
 * Removes anything secret-shaped from free text: JWTs, bearer tokens, `key=value` credentials,
 * long opaque tokens (UUIDs are kept, they are the row ids a diagnosis needs), query strings on
 * embedded URLs, and the literal E2E secrets present in the environment.
 */
export function redactDiagnostics(
  text: string,
  secrets: readonly string[] = collectSecrets()
): string {
  let out = scrubSecrets(text, secrets);
  out = out.replace(/(https?:\/\/[^\s?#"'`<>)\]]+)[?#][^\s"'`<>)\]]*/gi, '$1');
  out = out.replace(/eyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*){0,2}/g, '[REDACTED_JWT]');
  out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
  out = out.replace(
    /\b(access_token|refresh_token|id_token|apikey|api_key|password|passwd|secret|token|authorization|cookie)(["']?\s*[:=]\s*["']?)[^\s&"',;]+/gi,
    '$1$2[REDACTED]'
  );
  out = out.replace(/[A-Za-z0-9_-]{40,}/g, token =>
    UUID.test(token) || !/\d/.test(token) ? token : '[REDACTED_TOKEN]'
  );
  return out;
}

function clip(text: string, max = MAX_TEXT): string {
  return text.length > max
    ? `${text.slice(0, max)}... [truncated ${text.length - max} chars]`
    : text;
}

export interface BrowserDiagnosticsLog {
  console: string[];
  pageErrors: string[];
  requestFailures: string[];
  assetFailures: string[];
}

export function emptyDiagnosticsLog(): BrowserDiagnosticsLog {
  return { console: [], pageErrors: [], requestFailures: [], assetFailures: [] };
}

function push(list: string[], line: string) {
  if (list.length < MAX_ENTRIES) list.push(line);
  else if (list.length === MAX_ENTRIES) list.push('... further entries dropped');
}

export interface PageSnapshot {
  url: string;
  regions: string[];
  main: string;
}

export function formatDiagnostics(
  log: BrowserDiagnosticsLog,
  snapshot: PageSnapshot | { error: string },
  secrets: readonly string[] = collectSecrets()
): string {
  const section = (title: string, lines: string[]) =>
    `## ${title} (${lines.length})\n${lines.length > 0 ? lines.join('\n') : '(none)'}`;
  const page =
    'error' in snapshot
      ? `## Page snapshot\n(unavailable: ${snapshot.error})`
      : [
          `## Page URL\n${stripUrlQuery(snapshot.url)}`,
          section(
            'Alert / toast regions',
            snapshot.regions.map(text => `- ${clip(text, MAX_TEXT)}`)
          ),
          `## Main region text\n${clip(snapshot.main, MAX_REGION_TEXT) || '(empty)'}`,
        ].join('\n\n');
  const body = [
    section('Console', log.console),
    section('Page errors', log.pageErrors),
    section('Failed requests', log.requestFailures),
    section('JS/CSS responses >= 400', log.assetFailures),
    page,
  ].join('\n\n');
  return redactDiagnostics(body, secrets);
}

function isAssetResponse(url: string, resourceType: string): boolean {
  return (
    resourceType === 'script' ||
    resourceType === 'stylesheet' ||
    /\.(?:m?js|css)$/i.test(stripUrlQuery(url))
  );
}

/** Wires the listeners and returns the live log. Listeners die with the page. */
export function collectBrowserDiagnostics(page: Page): BrowserDiagnosticsLog {
  const log = emptyDiagnosticsLog();
  const started = Date.now();
  const at = () => `+${Date.now() - started}ms`;

  page.on('console', message => {
    const type = message.type();
    const text = message.text();
    if (type !== 'error' && type !== 'warning' && !INTERESTING_CONSOLE.test(text)) return;
    const source = stripUrlQuery(message.location().url ?? '');
    push(log.console, `${at()} [${type}] ${clip(text)}${source ? ` (${source})` : ''}`);
  });
  page.on('pageerror', error => {
    push(log.pageErrors, `${at()} ${clip(error.stack ?? `${error.name}: ${error.message}`)}`);
  });
  page.on('requestfailed', request => {
    push(
      log.requestFailures,
      `${at()} ${request.method()} ${request.resourceType()} ${stripUrlQuery(request.url())} -> ${
        request.failure()?.errorText ?? 'unknown failure'
      }`
    );
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    const request = response.request();
    if (!isAssetResponse(response.url(), request.resourceType())) return;
    push(log.assetFailures, `${at()} ${response.status()} ${stripUrlQuery(response.url())}`);
  });
  return log;
}

async function snapshotPage(page: Page): Promise<PageSnapshot | { error: string }> {
  try {
    const read = page.evaluate(() => {
      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const regionSelector =
        '[role="alert"], [role="status"], [data-sonner-toast], [data-sonner-toaster]';
      const regions = Array.from(document.querySelectorAll(regionSelector))
        .filter(visible)
        .map(el => (el as HTMLElement).innerText.trim())
        .filter(text => text.length > 0);
      const main = document.querySelector('main, [role="main"]') ?? document.body;
      return {
        regions: Array.from(new Set(regions)),
        main: (main as HTMLElement).innerText.trim(),
      };
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('page snapshot timed out')), SNAPSHOT_TIMEOUT_MS)
    );
    const { regions, main } = await Promise.race([read, timeout]);
    return { url: page.url(), regions, main };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const logs = new WeakMap<Page, BrowserDiagnosticsLog>();

/**
 * One-line use inside a spec's `test.describe`: `installBrowserDiagnostics(test);`
 * Collects for every test in that block; attaches only when a test did not end as expected.
 */
export function installBrowserDiagnostics(
  host: Pick<typeof PlaywrightTest, 'beforeEach' | 'afterEach'>
) {
  host.beforeEach(({ page }) => {
    logs.set(page, collectBrowserDiagnostics(page));
  });
  host.afterEach(async ({ page }, testInfo: TestInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    const log = logs.get(page) ?? emptyDiagnosticsLog();
    const body = formatDiagnostics(log, await snapshotPage(page));
    await testInfo.attach('browser-diagnostics', { body, contentType: 'text/plain' });
  });
}
