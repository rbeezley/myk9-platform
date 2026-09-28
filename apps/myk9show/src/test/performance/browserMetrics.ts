import type { Page } from '@playwright/test';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export function chunkInventory(appRoot: string): Array<{ file: string; bytes: number }> {
  const dir = resolve(appRoot, 'dist/assets/scripts');
  return readdirSync(dir)
    .filter(file => file.endsWith('.js'))
    .map(file => ({ file, bytes: statSync(resolve(dir, file)).size }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 15);
}

export interface ObservedRequest {
  url: string;
  bytes: number;
  cached: boolean;
  handledLocally: boolean;
}

/** Count network attempts and encoded JS bytes, excluding cache hits and local guard responses. */
export function summarizeNetworkTransfers(requests: ObservedRequest[]) {
  const network = requests.filter(request => !request.cached && !request.handledLocally);
  const scripts = network.filter(request => new URL(request.url).pathname.endsWith('.js'));
  return {
    requestCount: network.length,
    jsTransferBytes: scripts.reduce((sum, script) => sum + script.bytes, 0),
    jsChunks: scripts
      .map(script => ({
        file: new URL(script.url).pathname.split('/').at(-1) ?? 'script',
        bytes: script.bytes,
      }))
      .filter(script => script.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5),
  };
}

/** Read the navigation and resource entries after the route becomes usable. */
export async function readBrowserMetrics(page: Page) {
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    return {
      title: document.title,
      heading: document.querySelector('h1, h2, [role="heading"]')?.textContent?.trim() ?? '',
      ttfbMs: navigation?.responseStart ?? null,
      lcpMs: (window as Window & { __benchLcp?: number }).__benchLcp || null,
      cls: (window as Window & { __benchCls?: number | null }).__benchCls ?? null,
      tbtProxyMs: (window as Window & { __benchTbt?: number }).__benchTbt ?? 0,
    };
  });
  return metrics;
}
