import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type RelationCounters = {
  seq_scan: number;
  idx_scan: number;
};

type Snapshot = {
  database: string;
  captured_at: string;
  stats_reset: string | null;
  relations: Record<string, RelationCounters>;
};

const databaseUrl = process.env.MYK9_114_DATABASE_URL;
const showId = process.env.MYK9_114_SHOW_ID;
const classId = process.env.MYK9_114_CLASS_ID;
const authUserId = process.env.MYK9_114_AUTH_USER_ID;
const jwtClaims = process.env.MYK9_114_JWT_CLAIMS;
const watermark = process.env.MYK9_114_WATERMARK ?? '1970-01-01T00:00:00Z';

function findWorkspaceRoot(): string {
  let candidate = process.cwd();

  while (candidate !== dirname(candidate)) {
    if (existsSync(resolve(candidate, 'supabase/config.toml'))) {
      return candidate;
    }
    candidate = dirname(candidate);
  }

  throw new Error('Could not locate the myK9 workspace root');
}

const sqlPath = resolve(findWorkspaceRoot(), 'scripts/qa/db-drift/myk9-114-scan-evidence.sql');

const requiredEnvironment = {
  MYK9_114_DATABASE_URL: databaseUrl,
  MYK9_114_SHOW_ID: showId,
  MYK9_114_CLASS_ID: classId,
  MYK9_114_AUTH_USER_ID: authUserId,
  MYK9_114_JWT_CLAIMS: jwtClaims,
};

const missingEnvironment = Object.entries(requiredEnvironment)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingEnvironment.length > 0) {
  throw new Error(`Missing required environment: ${missingEnvironment.join(', ')}`);
}

function runEvidence(mode: 'snapshot' | 'read'): string {
  const result = spawnSync(
    'psql',
    [
      databaseUrl!,
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `evidence_mode=${mode}`,
      '-v',
      `show_id=${showId}`,
      '-v',
      `class_id=${classId}`,
      '-v',
      `auth_user_id=${authUserId}`,
      '-v',
      `jwt_claims=${jwtClaims}`,
      '-v',
      `watermark=${watermark}`,
      '-f',
      sqlPath,
    ],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(`Evidence ${mode} session failed:\n${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
}

function parseSnapshot(output: string): Snapshot {
  const jsonLine = output
    .split('\n')
    .map(line => line.trim())
    .findLast(line => line.startsWith('{'));

  if (!jsonLine) {
    throw new Error(`Snapshot session returned no JSON:\n${output}`);
  }

  return JSON.parse(jsonLine) as Snapshot;
}

const before = parseSnapshot(runEvidence('snapshot'));
runEvidence('read');
const after = parseSnapshot(runEvidence('snapshot'));

if (before.database !== after.database || before.stats_reset !== after.stats_reset) {
  throw new Error('Database identity or statistics-reset timestamp changed during evidence run');
}

const relationNames = ['user_roles', 'judge_assignments', 'show_passcodes'] as const;
const deltas = Object.fromEntries(
  relationNames.map(relationName => {
    const beforeCounters = before.relations[relationName] ?? {
      seq_scan: 0,
      idx_scan: 0,
    };
    const afterCounters = after.relations[relationName] ?? {
      seq_scan: 0,
      idx_scan: 0,
    };
    const seqScanDelta = afterCounters.seq_scan - beforeCounters.seq_scan;
    const idxScanDelta = afterCounters.idx_scan - beforeCounters.idx_scan;
    const totalScanDelta = seqScanDelta + idxScanDelta;

    return [
      relationName,
      {
        seq_scan_delta: seqScanDelta,
        idx_scan_delta: idxScanDelta,
        total_scan_delta: totalScanDelta,
        passes_max_two_scans: totalScanDelta >= 0 && totalScanDelta <= 2,
      },
    ];
  })
);

const evidence = {
  database: before.database,
  before_captured_at: before.captured_at,
  after_captured_at: after.captured_at,
  stats_reset: before.stats_reset,
  representative_reads: 1,
  deltas,
};

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);

if (Object.values(deltas).some(({ passes_max_two_scans }) => !passes_max_two_scans)) {
  process.exitCode = 1;
}
