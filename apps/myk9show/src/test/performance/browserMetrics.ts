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

/** Read the navigation and resource entries after the route becomes usable. */
export function readBrowserMetrics(page: Page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const scripts = resources.filter(resource => resource.initiatorType === 'script');
    return {
      title: document.title,
      heading: document.querySelector('h1, h2, [role="heading"]')?.textContent?.trim() ?? '',
      ttfbMs: navigation?.responseStart ?? null,
      lcpMs: (window as Window & { __benchLcp?: number }).__benchLcp || null,
      cls: (window as Window & { __benchCls?: number | null }).__benchCls ?? null,
      tbtProxyMs: (window as Window & { __benchTbt?: number }).__benchTbt ?? 0,
      jsTransferBytes: scripts.reduce((sum, script) => sum + script.transferSize, 0),
      jsChunks: scripts
        .map(script => ({
          file: new URL(script.name).pathname.split('/').at(-1) ?? 'script',
          bytes: script.transferSize,
        }))
        .filter(script => script.bytes > 0)
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 5),
      requestCount: resources.length,
    };
  });
}
