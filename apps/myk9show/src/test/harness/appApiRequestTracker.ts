import type { Page, Request } from '@playwright/test';

const DEFAULT_IDLE_MS = 100;
const DEFAULT_TIMEOUT_MS = 5000;

export function isAppApiRequest(request: Request) {
  const url = request.url();
  return url.includes('/rest/v1/') || url.includes('/functions/v1/') || url.includes('/auth/v1/');
}

export function watchAppApiRequests(page: Page) {
  const pending = new Set<Request>();

  page.on('request', request => {
    if (isAppApiRequest(request)) pending.add(request);
  });
  page.on('requestfinished', request => pending.delete(request));
  page.on('requestfailed', request => pending.delete(request));

  return pending;
}

export async function waitForAppApiRequestsToSettle(
  page: Page,
  pending: Set<Request>,
  { idleMs = DEFAULT_IDLE_MS, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const deadline = Date.now() + timeoutMs;
  let idleSince: number | null = null;

  while (Date.now() < deadline) {
    if (pending.size === 0) {
      idleSince ??= Date.now();
      if (Date.now() - idleSince >= idleMs) return [];
    } else {
      idleSince = null;
    }

    await page.waitForTimeout(Math.min(25, idleMs));
  }

  return [...pending].map(request => request.url());
}
