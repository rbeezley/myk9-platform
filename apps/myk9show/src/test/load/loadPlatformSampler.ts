import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  PlatformObservation,
  ResourceSamplingFailure,
  StatementDelta,
} from './loadEvaluation';

class ResourceSampleError extends Error {
  constructor(
    readonly kind: ResourceSamplingFailure['kind'],
    readonly status?: number
  ) {
    super(`Platform resource sample failed: ${kind}`);
  }
}

const execFileAsync = promisify(execFile);
/** Matches the coverage bar generator evidence already has to clear. */
export const MIN_SAMPLE_COVERAGE = 0.8;
const STATEMENT_SNAPSHOT_SQL = `
SELECT queryid::text, calls, rows, total_exec_time
FROM pg_stat_statements
WHERE queryid IS NOT NULL;
`;
const CONNECTION_COUNT_SQL = `
SELECT count(*)
FROM pg_stat_activity
WHERE datname = current_database();
`;

interface StatementSnapshot {
  calls: number;
  rows: number;
  totalExecTimeMs: number;
}

export interface ResourceCounters {
  cpuSecondsByMode: ReadonlyMap<string, number>;
  diskIoSecondsByDevice: ReadonlyMap<string, number>;
}

interface DatabaseCommand {
  args: string[];
  env: NodeJS.ProcessEnv;
}

export interface LoadPlatformSampler {
  stop(): Promise<PlatformObservation>;
}

export async function startLoadPlatformSampler(
  env: NodeJS.ProcessEnv,
  connectionCap: number
): Promise<LoadPlatformSampler> {
  const databaseUrl = env.SUPABASE_DB_URL;
  if (!databaseUrl) throw new Error('Missing SUPABASE_DB_URL for platform telemetry.');

  const command = databaseCommand(databaseUrl, env);
  const [baseline, initialResources] = await Promise.all([
    readStatementSnapshot(command),
    readResourceCounters(env),
  ]);
  let peakConnections = 0;
  let connectionAttempts = 0;
  let connectionSuccesses = 0;
  const resourceFailures: ResourceSamplingFailure[] = [];
  let resourceAttempts = 1;
  let resourceSuccesses = 1;
  let peakCpuPercent = Number.NaN;
  let peakIoPercent = Number.NaN;
  let previousResources = initialResources;
  let previousResourceSampleAt = Date.now();
  let stopPromise: Promise<PlatformObservation> | undefined;
  let connectionSample: Promise<void> | undefined;
  const pendingSamples = new Set<Promise<void>>();

  const sampleConnections = () => {
    connectionAttempts += 1;
    if (connectionSample) {
      // A skipped scheduled observation is missing peak evidence, not a success.
      return;
    }
    const task = readConnectionCount(command)
      .then(count => {
        connectionSuccesses += 1;
        peakConnections = Math.max(peakConnections, count);
      })
      .catch(() => undefined)
      .finally(() => {
        connectionSample = undefined;
        pendingSamples.delete(task);
      });
    connectionSample = task;
    pendingSamples.add(task);
  };

  const sampleResources = () => {
    resourceAttempts += 1;
    const task = readResourceCountersWithRetry(env)
      .then(counters => {
        resourceSuccesses += 1;
        const sampledAt = Date.now();
        const utilization = resourceUtilization(
          previousResources,
          counters,
          (sampledAt - previousResourceSampleAt) / 1_000
        );
        peakCpuPercent = maxFinite(peakCpuPercent, utilization.cpuPercent);
        peakIoPercent = maxFinite(peakIoPercent, utilization.ioPercent);
        previousResources = counters;
        previousResourceSampleAt = sampledAt;
      })
      .catch((error: unknown) => {
        const kind = error instanceof ResourceSampleError ? error.kind : 'transport';
        const status = error instanceof ResourceSampleError ? error.status : undefined;
        const existing = resourceFailures.find(
          failure => failure.kind === kind && failure.status === status
        );
        if (existing) existing.count += 1;
        else resourceFailures.push({ kind, ...(status !== undefined ? { status } : {}), count: 1 });
      })
      .finally(() => pendingSamples.delete(task));
    pendingSamples.add(task);
  };

  sampleConnections();
  const connectionInterval = setInterval(sampleConnections, 2_000);
  const resourceInterval = setInterval(sampleResources, 60_000);

  return {
    stop() {
      if (stopPromise) return stopPromise;
      clearInterval(connectionInterval);
      clearInterval(resourceInterval);
      stopPromise = (async () => {
        await Promise.all(pendingSamples);
        sampleConnections();
        sampleResources();
        await Promise.all(pendingSamples);

        const finalSnapshot = await readStatementSnapshot(command).catch(() => undefined);
        // Coverage-based, not zero-tolerance. A single lost sample used to NaN
        // the entire CPU/IO/connection picture, which is what blocked the gate
        // on run 33038456110 -- 11 of 14 resource samples succeeded and the
        // result was still "telemetry missing". A peak from most of the window
        // is worth more than nothing, provided the coverage is stated. The 80%
        // bar matches what generator evidence already requires, and this is
        // deliberately NOT tuned down to whatever that run happened to score:
        // the retry above is what should lift coverage over the line.
        const resourceCoverage = resourceSuccesses / Math.max(1, resourceAttempts);
        const connectionCoverage = connectionSuccesses / Math.max(1, connectionAttempts);
        return {
          peakCpuPercent: resourceCoverage >= MIN_SAMPLE_COVERAGE ? peakCpuPercent : Number.NaN,
          peakIoPercent: resourceCoverage >= MIN_SAMPLE_COVERAGE ? peakIoPercent : Number.NaN,
          peakConnections: connectionCoverage >= MIN_SAMPLE_COVERAGE ? peakConnections : Number.NaN,
          connectionCap,
          statementDeltas: finalSnapshot ? statementDeltas(baseline, finalSnapshot) : [],
          resourceSampling: {
            attempts: resourceAttempts,
            succeeded: resourceSuccesses,
            failures: resourceFailures,
          },
        };
      })();
      return stopPromise;
    },
  };
}

export function statementDeltas(
  baseline: ReadonlyMap<string, StatementSnapshot>,
  finalSnapshot: ReadonlyMap<string, StatementSnapshot>
): StatementDelta[] {
  const deltas: StatementDelta[] = [];
  for (const [queryId, finalValue] of finalSnapshot) {
    const initial = baseline.get(queryId);
    const calls = Math.max(0, finalValue.calls - (initial?.calls ?? 0));
    if (calls === 0) continue;
    const rows = Math.max(0, finalValue.rows - (initial?.rows ?? 0));
    const totalExecTimeMs = Math.max(
      0,
      finalValue.totalExecTimeMs - (initial?.totalExecTimeMs ?? 0)
    );
    deltas.push({
      queryId,
      calls,
      rows,
      totalExecTimeMs,
      meanExecTimeMs: totalExecTimeMs / calls,
    });
  }
  return deltas.sort((left, right) => right.totalExecTimeMs - left.totalExecTimeMs).slice(0, 20);
}

export function parsePrometheusResourceCounters(metrics: string): ResourceCounters {
  const cpuSecondsByMode = new Map<string, number>();
  const diskIoSecondsByDevice = new Map<string, number>();

  for (const line of metrics.split('\n')) {
    const parsed = parsePrometheusSample(line);
    if (!parsed) continue;
    if (parsed.name === 'node_cpu_seconds_total') {
      const mode = parsed.labels.get('mode');
      if (mode) {
        cpuSecondsByMode.set(mode, (cpuSecondsByMode.get(mode) ?? 0) + parsed.value);
      }
    } else if (parsed.name === 'node_disk_io_time_seconds_total') {
      const device = parsed.labels.get('device');
      if (device) diskIoSecondsByDevice.set(device, parsed.value);
    }
  }

  if (cpuSecondsByMode.size === 0 || diskIoSecondsByDevice.size === 0) {
    throw new Error('Supabase Metrics API response omitted CPU or disk IO counters.');
  }

  return { cpuSecondsByMode, diskIoSecondsByDevice };
}

export function resourceUtilization(
  previous: ResourceCounters,
  current: ResourceCounters,
  elapsedSeconds: number
): { cpuPercent: number; ioPercent: number } {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return { cpuPercent: Number.NaN, ioPercent: Number.NaN };
  }

  let totalCpuDelta = 0;
  let idleCpuDelta = 0;
  for (const [mode, value] of current.cpuSecondsByMode) {
    const delta = Math.max(0, value - (previous.cpuSecondsByMode.get(mode) ?? value));
    totalCpuDelta += delta;
    if (mode === 'idle') idleCpuDelta += delta;
  }

  let ioPercent = Number.NaN;
  for (const [device, value] of current.diskIoSecondsByDevice) {
    const previousValue = previous.diskIoSecondsByDevice.get(device);
    if (previousValue === undefined) continue;
    const devicePercent = (Math.max(0, value - previousValue) / elapsedSeconds) * 100;
    ioPercent = maxFinite(ioPercent, Math.min(100, devicePercent));
  }

  return {
    cpuPercent:
      totalCpuDelta > 0 ? Math.min(100, ((totalCpuDelta - idleCpuDelta) / totalCpuDelta) * 100) : 0,
    ioPercent,
  };
}

/**
 * One immediate retry on a transient failure. A dropped sample costs more than
 * itself: `previousResources` is only advanced on success, so the NEXT sample
 * spans 120 s instead of 60 s and averages away exactly the spike a peak exists
 * to catch. Run 33038456110 lost 3 of 14 samples to Metrics API timeouts and
 * with them the whole CPU/IO/connection picture.
 */
async function readResourceCountersWithRetry(env: NodeJS.ProcessEnv): Promise<ResourceCounters> {
  try {
    return await readResourceCounters(env);
  } catch (error) {
    // Only transient classes are worth retrying; a bad credential or a
    // malformed response will fail again identically.
    const kind = error instanceof ResourceSampleError ? error.kind : 'transport';
    if (kind !== 'timeout' && kind !== 'transport') throw error;
    return await readResourceCounters(env);
  }
}

async function readResourceCounters(env: NodeJS.ProcessEnv): Promise<ResourceCounters> {
  const projectRef = env.LOAD_TEST_SUPABASE_PROJECT_REF;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error('Missing or invalid Supabase project ref for Metrics API telemetry.');
  }
  if (!serviceKey) throw new Error('Missing Supabase Metrics API credential.');

  const authorization = Buffer.from(`username:${serviceKey}`).toString('base64');
  try {
    const response = await fetch(
      `https://${projectRef}.supabase.co/customer/v1/privileged/metrics`,
      {
        headers: { Authorization: `Basic ${authorization}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!response.ok) throw new ResourceSampleError('http', response.status);
    const text = await response.text();
    try {
      return parsePrometheusResourceCounters(text);
    } catch {
      throw new ResourceSampleError('invalid-counters');
    }
  } catch (error) {
    if (error instanceof ResourceSampleError) throw error;
    throw new ResourceSampleError(
      error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
        ? 'timeout'
        : 'transport'
    );
  }
}

function databaseCommand(databaseUrl: string, baseEnv: NodeJS.ProcessEnv): DatabaseCommand {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('SUPABASE_DB_URL is not a valid database URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('SUPABASE_DB_URL must be a PostgreSQL URL.');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database || !parsed.username) throw new Error('SUPABASE_DB_URL is incomplete.');
  const password = parsed.password
    ? decodeURIComponent(parsed.password)
    : baseEnv.SUPABASE_DB_PASSWORD;
  if (!password) throw new Error('Missing Supabase database password.');

  return {
    args: [
      '--no-password',
      '--host',
      parsed.hostname,
      '--port',
      parsed.port || '5432',
      '--username',
      decodeURIComponent(parsed.username),
      '--dbname',
      database,
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-F',
      '|',
    ],
    env: {
      ...baseEnv,
      PGPASSWORD: password,
      PGCONNECT_TIMEOUT: '10',
      PGSSLMODE:
        parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' ? 'disable' : 'require',
    },
  };
}

function parsePrometheusSample(
  line: string
): { name: string; labels: ReadonlyMap<string, string>; value: number } | undefined {
  const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+(\S+)$/);
  if (!match) return undefined;
  const value = Number(match[3]);
  if (!Number.isFinite(value)) return undefined;
  const labels = new Map<string, string>();
  for (const label of match[2].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"])*)"/g)) {
    labels.set(label[1], label[2]);
  }
  return { name: match[1], labels, value };
}

function maxFinite(left: number, right: number): number {
  if (!Number.isFinite(left)) return right;
  if (!Number.isFinite(right)) return left;
  return Math.max(left, right);
}

async function runPsql(command: DatabaseCommand, sql: string): Promise<string> {
  try {
    // Session-mode Supavisor need not forward PGOPTIONS. Set the deadline via SQL
    // on this telemetry connection; ON_ERROR_STOP prevents sampling if SET fails.
    const result = await execFileAsync(
      'psql',
      [...command.args, '--quiet', '--command', 'SET statement_timeout = 10000', '--command', sql],
      {
        env: command.env,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        timeout: 15_000,
        killSignal: 'SIGKILL',
      }
    );
    return result.stdout;
  } catch {
    throw new Error('Platform database telemetry query failed.');
  }
}

async function readStatementSnapshot(
  command: DatabaseCommand
): Promise<Map<string, StatementSnapshot>> {
  const output = await runPsql(command, STATEMENT_SNAPSHOT_SQL);
  const snapshot = new Map<string, StatementSnapshot>();
  for (const line of output.trim().split(/\r?\n/)) {
    if (!line) continue;
    const [queryId, calls, rows, totalExecTimeMs] = line.split('|');
    const parsed = {
      calls: Number(calls),
      rows: Number(rows),
      totalExecTimeMs: Number(totalExecTimeMs),
    };
    if (
      !queryId ||
      !Number.isFinite(parsed.calls) ||
      !Number.isFinite(parsed.rows) ||
      !Number.isFinite(parsed.totalExecTimeMs)
    ) {
      throw new Error('Platform statement telemetry returned an invalid row.');
    }
    snapshot.set(queryId, parsed);
  }
  return snapshot;
}

async function readConnectionCount(command: DatabaseCommand): Promise<number> {
  const output = (await runPsql(command, CONNECTION_COUNT_SQL)).trim();
  const value = Number(output);
  if (!/^\d+$/.test(output) || !Number.isSafeInteger(value)) {
    throw new Error('Platform connection telemetry was invalid.');
  }
  return value;
}
