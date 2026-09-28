import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { benchmarkRoutesFor } from './benchmarkRoutes';
import { chunkInventory } from './browserMetrics';
import {
  formatBenchmarkReport,
  type BenchmarkSample,
  type NetworkProfile,
} from './benchmarkReport';
import { failedWorkerResult, validatePairResult, type PairSpec } from './benchmarkRun';
import { signIn } from './benchmarkAttempt';
import type { BenchmarkRole } from './benchmarkRoutes';
import type { Session } from '@supabase/supabase-js';

const appRoot = process.cwd();
const repoRoot = resolve(appRoot, '../..');
const showId =
  process.env.MYK9_PERF_SHOW_ID ??
  process.env.QA_SECRETARY_SHOW_ID ??
  'dededede-0000-0000-0000-000000000010';
const origin = process.env.MYK9_PERF_BASE_URL ?? 'http://127.0.0.1:4173';
const runId = randomUUID();
const buildRef = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
const reportDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const reportPath = resolve(
  repoRoot,
  process.env.MYK9_PERF_REPORT_PATH ?? `docs/qa/perf-baseline-${reportDate}.md`
);
const runDirectory = resolve(repoRoot, `.logs/perf-${runId}`);
// A pair can spend its full navigation and readiness budgets on all three page loads,
// plus service-worker activation during warm priming.
const pairTimeoutMs =
  3 * Number(process.env.MYK9_PERF_NAVIGATION_TIMEOUT_MS ?? 25_000) +
  3 * Number(process.env.MYK9_PERF_READY_TIMEOUT_MS ?? 60_000) +
  90_000 +
  15_000;

async function main(): Promise<void> {
  const routes = benchmarkRoutesFor(showId);
  const selected = routes.filter(
    route =>
      (!process.env.MYK9_PERF_ROUTES ||
        process.env.MYK9_PERF_ROUTES.split(',').includes(route.id)) &&
      !process.env.MYK9_PERF_EXCLUDE_ROUTES?.split(',').includes(route.id)
  );
  if (!selected.length) throw new Error('No benchmark routes selected');
  const repeats = Number(process.env.MYK9_PERF_REPEATS ?? 3);
  if (!Number.isInteger(repeats) || repeats < 1)
    throw new Error('MYK9_PERF_REPEATS must be positive');
  if (existsSync(reportPath) && process.env.MYK9_PERF_OVERWRITE !== '1')
    throw new Error(
      `Report already exists: ${reportPath}; set MYK9_PERF_OVERWRITE=1 only after reviewing it`
    );
  mkdirSync(runDirectory, { recursive: true });
  const manifest: PairSpec[] = selected.flatMap(route => {
    const profiles: NetworkProfile[] =
      route.role === 'secretary'
        ? ['fast-4g-mobile', 'slow-4g-mobile', 'secretary-desktop']
        : ['fast-4g-mobile', 'slow-4g-mobile'];
    const chosen = profiles.filter(
      profile =>
        !process.env.MYK9_PERF_PROFILES ||
        process.env.MYK9_PERF_PROFILES.split(',').includes(profile)
    );
    if (!chosen.length) throw new Error(`No profiles selected for ${route.id}`);
    return chosen.flatMap(profile =>
      Array.from({ length: repeats }, (_, index) => ({
        runId,
        buildRef,
        showId,
        routeId: route.id,
        profile,
        repeat: index + 1,
      }))
    );
  });
  writeFileSync(
    resolve(runDirectory, 'manifest.json'),
    JSON.stringify({ runId, origin, reportPath, pairs: manifest }, null, 2)
  );
  const sessions: Partial<Record<BenchmarkRole, Session | null>> = {};
  for (const role of [...new Set(selected.map(route => route.role))]) {
    if (role !== 'public') sessions[role] = await signIn(role);
    if (role !== 'public')
      console.log(`${role}: ${sessions[role] ? 'authenticated' : 'unavailable'}`);
  }
  const chunks = chunkInventory(appRoot);
  const samples: BenchmarkSample[] = [];
  for (const [index, spec] of manifest.entries()) {
    const route = routes.find(candidate => candidate.id === spec.routeId);
    if (!route) throw new Error(`Unknown route ${spec.routeId}`);
    const output = resolve(runDirectory, `${index + 1}.json`);
    console.log(
      `[${index + 1}/${manifest.length}] ${spec.routeId} ${spec.profile} repeat ${spec.repeat}`
    );
    const worker = spawnSync('pnpm', ['exec', 'tsx', 'src/test/performance/benchmarkWorker.ts'], {
      cwd: appRoot,
      env: {
        ...process.env,
        MYK9_PERF_PAIR: JSON.stringify({ ...spec, output }),
        MYK9_PERF_SESSION: sessions[route.role] ? JSON.stringify(sessions[route.role]) : '',
      },
      encoding: 'utf8',
      timeout: pairTimeoutMs,
      maxBuffer: 2_000_000,
    });
    if (worker.stdout) process.stdout.write(worker.stdout);
    if (worker.stderr) process.stderr.write(worker.stderr);
    try {
      if (worker.error || worker.status !== 0)
        throw new Error(
          worker.error?.message ?? `worker exit ${worker.status}, signal ${worker.signal}`
        );
      samples.push(
        ...validatePairResult(JSON.parse(readFileSync(output, 'utf8')) as unknown, spec, route)
          .samples
      );
    } catch (error) {
      const stderr = worker.stderr?.trim() ?? '';
      const stdout = worker.stdout?.trim() ?? '';
      writeFileSync(`${output}.worker.log`, [stderr, stdout].filter(Boolean).join('\n'));
      const detail = stderr.split('\n')[0].slice(0, 120);
      const reason = `Isolated worker failed: ${error instanceof Error ? error.message : String(error)}${detail ? `; ${detail}` : ''}`;
      console.error(reason);
      if (existsSync(output)) renameSync(output, `${output}.invalid.json`);
      const failed = failedWorkerResult(route, spec, reason);
      writeFileSync(`${output}.tmp`, JSON.stringify(failed));
      renameSync(`${output}.tmp`, output);
      samples.push(...validatePairResult(failed, spec, route).samples);
    }
    writeFileSync(resolve(runDirectory, 'samples.json'), JSON.stringify(samples));
  }
  if (samples.length !== manifest.length * 2) throw new Error('Incomplete benchmark matrix');
  writeFileSync(
    reportPath,
    formatBenchmarkReport(samples, chunks, {
      origin,
      showId,
      buildRef,
      routeCount: routes.length,
      readyTimeoutMs: Number(process.env.MYK9_PERF_READY_TIMEOUT_MS ?? 60_000),
      reportDate,
      runId,
      timingBufferSize: 10_000,
    })
  );
  console.log(`Baseline written: ${reportPath}`);
  console.log(
    `Measured ${samples.filter(sample => sample.status === 'measured').length}/${samples.length}; blocked ${samples.filter(sample => sample.status === 'blocked').length}`
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
