import { rankSlowestRoutes } from './benchmarkMetrics';

export type NetworkProfile = 'fast-4g-mobile' | 'slow-4g-mobile' | 'secretary-desktop';

export interface BenchmarkSample {
  routeId: string;
  role: string;
  path: string;
  profile: NetworkProfile;
  cache: 'cold' | 'warm';
  repeat?: number;
  status: 'measured' | 'blocked';
  reason?: string;
  finalPath?: string;
  title?: string;
  heading?: string;
  timeToUsableMs?: number;
  ttfbMs?: number;
  lcpMs?: number | null;
  cls?: number | null;
  tbtProxyMs?: number;
  jsTransferBytes?: number;
  jsChunks?: Array<{ file: string; bytes: number }>;
  requestCount?: number;
  slowestSupabase?: Array<{ path: string; durationMs: number }>;
}

interface ReportMetadata {
  origin: string;
  showId: string;
  buildRef: string;
  routeCount: number;
  readyTimeoutMs?: number;
  reportDate: string;
  runId: string;
  timingBufferSize: number;
}

function numericRange(values: number[], unit: string): string {
  if (values.length === 0) return 'unavailable';
  return `${Math.min(...values).toFixed(0)}–${Math.max(...values).toFixed(0)} ${unit}`;
}

function reportReason(reason: string | undefined): string {
  if (!reason) return '';
  const [rawSummary, diagnostic] = reason.split('; page:');
  const summary = rawSummary.replace('Warm run not attempted', 'Second pass not attempted');
  const parts = diagnostic?.split(' / ') ?? [];
  const visibleState = parts.find(
    part =>
      part === 'access denied state' ||
      (!part.startsWith('document ') &&
        !part.startsWith('failed request:') &&
        !part.startsWith('page error:') &&
        !part.includes(' · Dog show management'))
  );
  const category = reason.includes('document 0 chars')
    ? ' [document lost]'
    : visibleState
      ? ` [page: ${visibleState.slice(0, 70)}]`
      : '';
  return `${summary}${category}`.slice(0, 220).replaceAll('|', '\\|');
}

function passLabel(cache: BenchmarkSample['cache']): string {
  return cache === 'cold' ? 'cold' : 'same-context uncached';
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function medianSamples(samples: BenchmarkSample[]): Array<BenchmarkSample & { runs: number }> {
  const groups = new Map<string, BenchmarkSample[]>();
  for (const sample of samples.filter(value => value.status === 'measured')) {
    const key = `${sample.routeId}|${sample.profile}|${sample.cache}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  return [...groups.values()].map(group => {
    const first = group[0];
    const value = (read: (sample: BenchmarkSample) => number | undefined | null) =>
      median(
        group.flatMap(sample => {
          const result = read(sample);
          return result == null ? [] : [result];
        })
      );
    return {
      ...first,
      runs: group.length,
      timeToUsableMs: value(sample => sample.timeToUsableMs),
      lcpMs: value(sample => sample.lcpMs),
      ttfbMs: value(sample => sample.ttfbMs),
      cls: value(sample => sample.cls),
      tbtProxyMs: value(sample => sample.tbtProxyMs),
      jsTransferBytes: value(sample => sample.jsTransferBytes),
      requestCount: value(sample => sample.requestCount),
    };
  });
}

export function formatBenchmarkReport(
  samples: BenchmarkSample[],
  chunks: Array<{ file: string; bytes: number }>,
  metadata: ReportMetadata
): string {
  const measured = samples.filter(sample => sample.status === 'measured');
  const medians = medianSamples(samples);
  const sorted = rankSlowestRoutes(medians);
  const routeIds = [...new Set(samples.map(sample => sample.routeId))];
  const blockedRoutes = [
    ...new Set(samples.filter(sample => sample.status === 'blocked').map(sample => sample.routeId)),
  ];
  const blockedCount = samples.filter(sample => sample.status === 'blocked').length;
  const profiles = [...new Set(samples.map(sample => sample.profile))];
  const repeats = Math.max(1, ...samples.map(sample => sample.repeat ?? 1));
  const lcpValues = measured.flatMap(sample => (sample.lcpMs == null ? [] : [sample.lcpMs]));
  const tbtValues = measured.flatMap(sample =>
    sample.tbtProxyMs == null ? [] : [sample.tbtProxyMs]
  );
  const ttfbValues = measured.flatMap(sample => (sample.ttfbMs == null ? [] : [sample.ttfbMs]));
  const overLcp = lcpValues.filter(value => value > 2500).length;
  const overUsable = measured.filter(
    sample =>
      sample.timeToUsableMs != null &&
      sample.profile !== 'secretary-desktop' &&
      sample.timeToUsableMs > (sample.profile === 'fast-4g-mobile' ? 3000 : 5000)
  ).length;
  const mobileCount = measured.filter(sample => sample.profile !== 'secretary-desktop').length;
  const mostJs = Math.max(0, ...measured.map(sample => sample.jsTransferBytes ?? 0));
  const largestChunk = chunks[0];
  const coldMeasured = measured.filter(sample => sample.cache === 'cold');
  const entryTransfers = largestChunk
    ? coldMeasured.flatMap(sample =>
        (sample.jsChunks ?? [])
          .filter(chunk => chunk.file === largestChunk.file)
          .map(chunk => chunk.bytes)
      )
    : [];
  const mostRequests = [...measured].sort(
    (a, b) => (b.requestCount ?? 0) - (a.requestCount ?? 0)
  )[0];
  const slowestLaunchRoute = sorted.find(
    sample =>
      (sample.role === 'secretary' || sample.role === 'judge') &&
      sample.profile === 'slow-4g-mobile' &&
      sample.cache === 'cold'
  );
  const whollyBlocked = blockedRoutes.filter(routeId =>
    samples
      .filter(sample => sample.routeId === routeId)
      .every(sample => sample.status === 'blocked')
  );
  const accessDenied = samples.some(sample => sample.reason?.includes('access denied state'));
  const lines = [
    `# myK9Show page performance baseline — ${metadata.reportDate}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    ...(blockedCount
      ? [`Status: Provisional — ${blockedCount} blocked of ${samples.length} attempts.`]
      : []),
    `Build ref: ${metadata.buildRef}`,
    `Run ID: ${metadata.runId}`,
    `App URL: ${metadata.origin}`,
    `Seed show: ${metadata.showId}`,
    '',
    '## Coverage',
    '',
    `- Sampled ${routeIds.length}/${metadata.routeCount} configured route IDs: ${routeIds.join(', ')}. ${routeIds.length < metadata.routeCount ? 'This is a partial route/role baseline.' : 'All configured route IDs were attempted.'}`,
    ...(blockedRoutes.length
      ? [
          `- Blocked route IDs: ${blockedRoutes.join(', ')}. These attempts have no measured load time and are excluded from medians and rankings.`,
          `- Blocked attempts by route: ${blockedRoutes.map(routeId => `${routeId} ${samples.filter(sample => sample.routeId === routeId && sample.status === 'blocked').length}`).join('; ')}.`,
        ]
      : []),
    ...(accessDenied
      ? [
          '- A configured account authenticated but reached an access-denied state; its route is blocked until it has the required show access.',
        ]
      : []),
    '',
    '## Reproduce this selection',
    '',
    'A fresh full-matrix run uses:',
    '',
    '```sh',
    `MYK9_PERF_REPORT_PATH=.logs/perf-reproduction-$(date +%s).md MYK9_PERF_ROUTES=${routeIds.join(',')} MYK9_PERF_PROFILES=${profiles.join(',')} MYK9_PERF_REPEATS=${repeats} MYK9_PERF_READY_TIMEOUT_MS=${metadata.readyTimeoutMs ?? 30000} pnpm --dir apps/myk9show performance:baseline`,
    '```',
    '',
    '## Run conditions',
    '',
    '- Production Vite build served locally with Playwright Chromium.',
    '- Each two-navigation pair used a separate Chromium process. Failed workers were recorded as blocked attempts; pair results were checked against the run manifest.',
    '- Mobile: 390×844 and 4× CPU; fast 4G is 40 ms / 5 Mbps down, slow 4G is 150 ms / 1.6 Mbps down. Secretary desktop: 1440×1000, 1× CPU and 25 Mbps down.',
    '- Cold uses a fresh browser context; the second pass revisits the route in that context. Service workers and WebSocket connections are blocked to prevent precaching and Realtime presence writes.',
    '- HTTP writes are blocked except token refresh and verified read-only RPCs. Telemetry POSTs receive a local 204 response without reaching staging. Playwright routing disables HTTP cache, so the second pass is a same-context uncached navigation, not a browser-cache warm load. Warm-cache performance remains unmeasured.',
    '- Time-to-usable stops after route-specific primary content remains available for 300 ms. LCP, CLS, and TBT proxy are read after a further 500 ms observation window.',
    `- Resource timing buffer size was ${metadata.timingBufferSize.toLocaleString()} entries per navigation.`,
    `- A route is blocked if primary content is not visible within ${((metadata.readyTimeoutMs ?? 30000) / 1000).toFixed(0)} s after DOM content loads; blocked samples have no measured load time.`,
    '- INP requires an interaction and is not reported. LCP is null when Chromium provides no entry.',
    '- Official field targets at the 75th percentile: LCP ≤2.5 s, INP <200 ms, CLS ≤0.1. Lab TBT proxy target: <200 ms. Custom mobile time-to-usable triage targets: ≤3 s fast 4G, ≤5 s slow 4G.',
    '',
    '## Route samples',
    '',
    '| Route | Role | Profile | Pass | Run | Status | Usable ms | TTFB ms | LCP ms | CLS | TBT proxy ms | JS bytes | Requests |',
    '|---|---|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|',
    ...samples.map(
      sample =>
        `| ${sample.path} | ${sample.role} | ${sample.profile} | ${passLabel(sample.cache)} | ${sample.repeat ?? 1} | ${sample.status}${sample.reason ? `: ${reportReason(sample.reason)}` : ''} | ${sample.timeToUsableMs?.toFixed(0) ?? '—'} | ${sample.ttfbMs?.toFixed(0) ?? '—'} | ${sample.lcpMs?.toFixed(0) ?? '—'} | ${sample.cls?.toFixed(3) ?? '—'} | ${sample.tbtProxyMs?.toFixed(0) ?? '—'} | ${sample.jsTransferBytes ?? '—'} | ${sample.requestCount ?? '—'} |`
    ),
    '',
    '## Median by route and profile',
    '',
    '| Route | Profile | Pass | Runs | Usable ms | LCP ms | TBT proxy ms | JS bytes |',
    '|---|---|---|---:|---:|---:|---:|---:|',
    ...medians.map(
      sample =>
        `| ${sample.path} | ${sample.profile} | ${passLabel(sample.cache)} | ${sample.runs} | ${sample.timeToUsableMs?.toFixed(0) ?? '—'} | ${sample.lcpMs?.toFixed(0) ?? '—'} | ${sample.tbtProxyMs?.toFixed(0) ?? '—'} | ${sample.jsTransferBytes?.toFixed(0) ?? '—'} |`
    ),
    '',
    '## Slowest measured routes (median)',
    '',
    ...(sorted.length
      ? sorted
          .slice(0, 10)
          .map(
            (sample, index) =>
              `${index + 1}. **${sample.path} (${sample.profile}, ${passLabel(sample.cache)})** — ${sample.timeToUsableMs?.toFixed(0)} ms median usable across ${sample.runs} run(s); ${sample.jsTransferBytes?.toFixed(0)} median JS bytes; ${sample.requestCount?.toFixed(0)} median requests. Example largest transferred chunks: ${sample.jsChunks?.map(chunk => `${chunk.file} (${chunk.bytes.toLocaleString()} B)`).join(', ') || 'none captured'}. ${sample.slowestSupabase?.map(request => `${request.path} ${request.durationMs.toFixed(0)} ms`).join(', ') || 'No Supabase response timings captured.'}`
          )
      : ['No route reached its primary content.']),
    '',
    '## Initial findings',
    '',
    ...(measured.length
      ? [
          `- ${overLcp}/${lcpValues.length} measured LCP samples exceeded 2.5 s. This lab comparison is a warning signal; formal Core Web Vitals pass/fail requires field data at the 75th percentile.`,
          `- ${overUsable}/${mobileCount} mobile samples exceeded the custom time-to-usable target for their profile.`,
          `- TBT proxy ranged ${numericRange(tbtValues, 'ms')}; the lab target is <200 ms. This sums observed long tasks through 500 ms after readiness.`,
          `- Maximum observed JavaScript transfer was ${(mostJs / 1_000_000).toFixed(2)} MB. The largest emitted minified chunk was ${largestChunk ? `${largestChunk.file} (${(largestChunk.bytes / 1_000_000).toFixed(2)} MB)` : 'unavailable'}. Initial JS delivery and parse are candidates for follow-up profiling, not established root causes.`,
          ...(entryTransfers.length
            ? [
                `- The largest entry chunk transferred in ${entryTransfers.length}/${coldMeasured.length} measured cold attempts, at ${numericRange(entryTransfers, 'bytes')} over the wire. Its transfer is a shared cost across those routes.`,
              ]
            : []),
          ...(slowestLaunchRoute
            ? [
                `- The slowest measured secretary or ringside cold route on slow 4G was ${slowestLaunchRoute.path}: ${slowestLaunchRoute.timeToUsableMs?.toFixed(0)} ms median across ${slowestLaunchRoute.runs} runs.`,
              ]
            : []),
          ...(mostRequests?.requestCount
            ? [
                `- The largest observed resource request count was ${mostRequests.requestCount} on ${mostRequests.path} (${mostRequests.profile}, ${passLabel(mostRequests.cache)}); investigate the request mix before assigning a cause.`,
              ]
            : []),
          ...(whollyBlocked.length
            ? [
                `- No usable measurement was obtained for ${whollyBlocked.join(', ')}. These routes need reliability investigation before they can be included in speed rankings.`,
              ]
            : []),
          `- Local preview TTFB ranged ${numericRange(ttfbValues, 'ms')}; this is not representative of production server response time.`,
        ]
      : [
          '- No route reached its primary content, so no load-time claims can be made for this selection.',
        ]),
    '',
    '## Largest production chunks',
    '',
    '| Chunk | Minified bytes |',
    '|---|---:|',
    ...chunks.map(chunk => `| \`${chunk.file}\` | ${chunk.bytes.toLocaleString()} |`),
    '',
    'See ignored `apps/myk9show/dist/stats.html` for the full treemap; rebuild with `pnpm --dir apps/myk9show build:production` to reproduce it.',
    '',
    '## Field data and limitations',
    '',
    '- Vercel Analytics source is integrated, but its project dashboard was not connected; route-level field data and a time window could not be retrieved.',
    '- Vercel Speed Insights is not configured in the app dependency/source scan.',
    '- Sentry performance traces could not be retrieved. No local Sentry DSN was configured for this build.',
    '- Blocked routes are never ranked as fast pages. Diagnose the failed route or browser, then rerun the affected profile matrix.',
    '',
  ];
  return lines.join('\n');
}
