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

interface ResourceTransfer {
  name: string;
  transferSize: number;
  initiatorType: string;
}

export function summarizeJavaScriptTransfer(resources: ResourceTransfer[]) {
  const scripts = resources.filter(resource => new URL(resource.name).pathname.endsWith('.js'));
  return {
    jsTransferBytes: scripts.reduce((sum, script) => sum + script.transferSize, 0),
    jsChunks: scripts
      .map(script => ({
        file: new URL(script.name).pathname.split('/').at(-1) ?? 'script',
        bytes: script.transferSize,
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
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return {
      title: document.title,
      heading: document.querySelector('h1, h2, [role="heading"]')?.textContent?.trim() ?? '',
      ttfbMs: navigation?.responseStart ?? null,
      lcpMs: (window as Window & { __benchLcp?: number }).__benchLcp || null,
      cls: (window as Window & { __benchCls?: number | null }).__benchCls ?? null,
      tbtProxyMs: (window as Window & { __benchTbt?: number }).__benchTbt ?? 0,
      resourceTransfers: resources.map(resource => ({
        name: resource.name,
        transferSize: resource.transferSize,
        initiatorType: resource.initiatorType,
      })),
      requestCount: resources.length,
    };
  });
  const { resourceTransfers, ...rest } = metrics;
  return { ...rest, ...summarizeJavaScriptTransfer(resourceTransfers) };
}
