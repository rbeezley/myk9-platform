import type { Page, Route } from '@playwright/test';

export const SHARED_STAGING_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';

type GuardedWriteKind = 'ringside-update-entry-rpc' | 'entries-patch';

interface RequestLike {
  method: string;
  url: string;
}

interface GuardedWrite {
  kind: GuardedWriteKind;
}

export interface GuardedRingsideRpcCall {
  p_entry_id?: string;
  p_fields?: Record<string, unknown>;
}

interface SharedStagingWriteGuardOptions {
  ringsideRpcCalls?: GuardedRingsideRpcCall[];
  versionBase?: number;
  interceptIsolatedRingsideWrites?: boolean;
}

export function classifySharedStagingWrite(request: RequestLike): GuardedWrite | null {
  const url = parseUrl(request.url);
  if (!url || !isSharedStagingHost(url.hostname)) {
    return null;
  }

  const method = request.method.toUpperCase();
  if (method === 'POST' && url.pathname === '/rest/v1/rpc/ringside_update_entry') {
    return { kind: 'ringside-update-entry-rpc' };
  }

  if (method === 'PATCH' && url.pathname === '/rest/v1/entries') {
    return { kind: 'entries-patch' };
  }

  return null;
}

export async function installSharedStagingWriteGuard(
  page: Page,
  options: SharedStagingWriteGuardOptions = {}
) {
  const ringsideRpcCalls = options.ringsideRpcCalls ?? [];
  const versionBase = options.versionBase ?? 100;
  const interceptIsolatedRingsideWrites = options.interceptIsolatedRingsideWrites ?? false;

  await page.route('**/rest/v1/rpc/ringside_update_entry', async route => {
    const request = route.request();
    const requestLike = {
      method: request.method(),
      url: request.url(),
    };
    const guardedWrite = classifySharedStagingWrite(requestLike);

    if (
      guardedWrite?.kind !== 'ringside-update-entry-rpc' &&
      !(interceptIsolatedRingsideWrites && isRingsideUpdateEntryRequest(requestLike))
    ) {
      await fallbackRoute(route);
      return;
    }

    const payload = (request.postDataJSON() ?? {}) as GuardedRingsideRpcCall;
    ringsideRpcCalls.push(payload);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(versionBase + ringsideRpcCalls.length),
    });
  });

  await page.route('**/rest/v1/entries**', async route => {
    const request = route.request();
    const guardedWrite = classifySharedStagingWrite({
      method: request.method(),
      url: request.url(),
    });

    if (guardedWrite?.kind !== 'entries-patch') {
      await fallbackRoute(route);
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isSharedStagingHost(hostname: string) {
  return hostname === `${SHARED_STAGING_PROJECT_REF}.supabase.co`;
}

function isRingsideUpdateEntryRequest(request: RequestLike) {
  const url = parseUrl(request.url);
  return (
    request.method.toUpperCase() === 'POST' &&
    url?.pathname === '/rest/v1/rpc/ringside_update_entry'
  );
}

async function fallbackRoute(route: Route) {
  await route.fallback();
}
