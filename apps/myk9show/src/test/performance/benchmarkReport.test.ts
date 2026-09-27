import { describe, expect, it } from 'vitest';
import { formatBenchmarkReport, type BenchmarkSample } from './benchmarkReport';

describe('MYK9-843 baseline report', () => {
  it('uses measured values and keeps blocked routes out of the slow-page ranking', () => {
    const samples: BenchmarkSample[] = [
      {
        routeId: 'home',
        role: 'public',
        path: '/',
        profile: 'fast-4g-mobile',
        cache: 'cold',
        status: 'measured',
        timeToUsableMs: 3500,
        lcpMs: 3000,
        tbtProxyMs: 300,
        ttfbMs: 8,
        jsTransferBytes: 1000,
        requestCount: 2,
      },
      {
        routeId: 'shows',
        role: 'public',
        path: '/shows',
        profile: 'fast-4g-mobile',
        cache: 'warm',
        status: 'measured',
        timeToUsableMs: 1800,
        lcpMs: 1500,
        tbtProxyMs: 150,
        ttfbMs: 2,
        jsTransferBytes: 0,
        requestCount: 1,
      },
      {
        routeId: 'secretary',
        role: 'secretary',
        path: '/secretary/dashboard',
        profile: 'secretary-desktop',
        cache: 'cold',
        status: 'blocked',
        reason: 'access denied state',
      },
    ];
    const report = formatBenchmarkReport(samples, [{ file: 'index.js', bytes: 3000 }], {
      origin: 'http://127.0.0.1:4173',
      showId: 'show-id',
      buildRef: 'test',
      routeCount: 18,
    });

    expect(report).toContain('Sampled 3/18 configured route IDs');
    expect(report).toContain('Blocked route IDs: secretary');
    expect(report).toContain('1/2 measured LCP samples exceeded 2.5 s');
    expect(report).toContain('1/2 mobile samples exceeded the custom time-to-usable target');
    expect(report).toContain('TBT proxy ranged 150–300 ms');
    expect(report).toContain('1. **/ (fast-4g-mobile, cold)**');
    expect(report).not.toContain('**/secretary/dashboard (secretary-desktop, cold)**');
    expect(report).toContain('access-denied state');
  });

  it('reports the median of repeated route measurements while preserving each run', () => {
    const samples: BenchmarkSample[] = [4200, 2800, 3600].map((timeToUsableMs, index) => ({
      routeId: 'home',
      role: 'public',
      path: '/',
      profile: 'fast-4g-mobile',
      cache: 'cold',
      repeat: index + 1,
      status: 'measured',
      timeToUsableMs,
      lcpMs: timeToUsableMs,
      jsTransferBytes: 1000,
    }));
    const report = formatBenchmarkReport(samples, [], {
      origin: 'http://127.0.0.1:4173',
      showId: 'show-id',
      buildRef: 'test',
      routeCount: 18,
    });

    expect(report).toContain('| / | fast-4g-mobile | cold | 3 | 3600 | 3600 |');
    expect(report).toContain('3600 ms median usable across 3 run(s)');
    expect(report).toContain('MYK9_PERF_REPEATS=3');
  });
});
