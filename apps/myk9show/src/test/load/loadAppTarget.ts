import type { Browser } from '@playwright/test';
import type { ResolvedLoadTarget } from './loadTarget';

const SUPABASE_PATH_PREFIXES = ['/rest/v1/', '/auth/v1/', '/realtime/v1/'];

export function supabaseRequestOrigin(requestUrl: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return undefined;
  }
  return SUPABASE_PATH_PREFIXES.some(prefix => parsed.pathname.startsWith(prefix))
    ? parsed.origin
    : undefined;
}

export async function assertApplicationTarget(
  browser: Browser,
  target: ResolvedLoadTarget
): Promise<void> {
  const context = await browser.newContext({ baseURL: target.baseUrl });
  const page = await context.newPage();
  let resolveOrigin: (origin: string) => void = () => undefined;
  const observedOrigin = new Promise<string>(resolve => {
    resolveOrigin = resolve;
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const identityTimeout = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Application target did not expose its Supabase identity.')),
      15_000
    );
  });

  page.on('request', request => {
    const origin = supabaseRequestOrigin(request.url());
    if (origin) resolveOrigin(origin);
  });

  try {
    await page.goto('/shows', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const origin = await Promise.race([observedOrigin, identityTimeout]);
    if (origin !== target.supabaseUrl) {
      throw new Error('Application and approved Supabase targets do not match.');
    }
  } finally {
    if (timeout) clearTimeout(timeout);
    await context.close();
  }
}
