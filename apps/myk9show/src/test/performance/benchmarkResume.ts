import { readFileSync } from 'node:fs';
import type { BenchmarkRoute } from './benchmarkRoutes';
import type { BenchmarkSample, NetworkProfile } from './benchmarkReport';

const numberOrUndefined = (value: string): number | undefined =>
  value === '—' ? undefined : Number(value);

/** Restore completed samples from a report after a browser or runner crash. */
export function readCompletedSamples(
  path: string,
  routes: readonly BenchmarkRoute[]
): BenchmarkSample[] {
  let report: string;
  try {
    report = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const rows = report.split('## Route samples\n')[1]?.split('\n## ')[0];
  if (!rows) return [];
  const samples: BenchmarkSample[] = [];
  for (const line of rows.split('\n')) {
    if (!line.startsWith('| /')) continue;
    const columns = line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map(column => column.trim());
    if (columns.length !== 13) continue;
    const [
      routePath,
      role,
      profile,
      cache,
      repeat,
      status,
      usable,
      ttfb,
      lcp,
      cls,
      tbt,
      js,
      requests,
    ] = columns;
    const route = routes.find(candidate => candidate.path === routePath && candidate.role === role);
    if (!route || !['cold', 'warm'].includes(cache)) continue;
    const isBlocked = status.startsWith('blocked');
    samples.push({
      routeId: route.id,
      role,
      path: routePath,
      profile: profile as NetworkProfile,
      cache: cache as 'cold' | 'warm',
      repeat: Number(repeat),
      status: isBlocked ? 'blocked' : 'measured',
      ...(isBlocked ? { reason: status.slice('blocked: '.length).replaceAll('\\|', '|') } : {}),
      timeToUsableMs: numberOrUndefined(usable),
      ttfbMs: numberOrUndefined(ttfb),
      lcpMs: numberOrUndefined(lcp) ?? null,
      cls: numberOrUndefined(cls) ?? null,
      tbtProxyMs: numberOrUndefined(tbt),
      jsTransferBytes: numberOrUndefined(js),
      requestCount: numberOrUndefined(requests),
    });
  }
  return samples;
}
