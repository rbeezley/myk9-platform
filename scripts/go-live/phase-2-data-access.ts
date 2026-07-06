import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEMO_SHOW_ID = 'dededede-0000-0000-0000-000000000010';

export type Phase2Status = 'ok' | 'warn' | 'fail';

export interface Phase2Check {
  key: string;
  status: Phase2Status;
  detail: string;
}

export interface JudgeCsvSummary {
  headerFound: boolean;
  dataRows: number;
}

interface CliOptions {
  allowBlocked: boolean;
  dbUrl?: string;
  rootDir: string;
}

export function summarizeJudgeCsv(csvText: string): JudgeCsvSummary {
  const rows = csvText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  const headerIndex = rows.findIndex(line => line.startsWith('judge_number,'));

  return {
    headerFound: headerIndex >= 0,
    dataRows: headerIndex >= 0 ? rows.slice(headerIndex + 1).length : 0,
  };
}

export function buildSourceChecks(rootDir: string): Phase2Check[] {
  const judgeCsvPath = path.join(rootDir, 'supabase/seed-data/akc-ukc-judges.csv');
  const importerPath = path.join(rootDir, 'scripts/import-judges.ts');
  const seedDemoPath = path.join(rootDir, 'supabase/seed-demo.sql');
  const migrationDir = path.join(rootDir, 'supabase/migrations');

  const judgeCsv = existsSync(judgeCsvPath) ? readFileSync(judgeCsvPath, 'utf8') : '';
  const judgeSummary = summarizeJudgeCsv(judgeCsv);
  const seedDemo = existsSync(seedDemoPath) ? readFileSync(seedDemoPath, 'utf8') : '';
  const migrationCorpus = existsSync(migrationDir) ? readTextCorpus(migrationDir) : '';

  const requiredSeedTokens = [
    DEMO_SHOW_ID,
    'judge_assignments',
    'show_passcodes',
    'secretary',
    'club_admin',
    'judge',
    'steward',
    'chairman',
  ];
  const missingSeedTokens = requiredSeedTokens.filter(token => !seedDemo.includes(token));

  return [
    {
      key: 'judge_csv_data_rows',
      status: judgeSummary.headerFound && judgeSummary.dataRows > 0 ? 'ok' : 'fail',
      detail: judgeSummary.headerFound
        ? `${judgeSummary.dataRows} judge data rows after header`
        : 'judge CSV header not found',
    },
    {
      key: 'judge_importer_present',
      status: existsSync(importerPath) ? 'ok' : 'fail',
      detail: path.relative(rootDir, importerPath),
    },
    {
      key: 'seed_demo_phase2_tokens',
      status: missingSeedTokens.length === 0 ? 'ok' : 'fail',
      detail:
        missingSeedTokens.length === 0
          ? 'seed-demo.sql references required Phase 2 demo data'
          : `missing tokens: ${missingSeedTokens.join(', ')}`,
    },
    {
      key: 'stale_anon_cleanup_source',
      status: migrationCorpus.includes('cleanup_stale_ringside_anon_users') ? 'ok' : 'fail',
      detail: 'cleanup_stale_ringside_anon_users migration source check',
    },
  ];
}

export function sqlChecklistPath(rootDir: string): string {
  return path.join(rootDir, 'scripts/go-live/phase-2-data-access.sql');
}

export function buildPsqlArgs(dbUrl: string, sqlPath: string): string[] {
  return ['--set', 'ON_ERROR_STOP=1', '--file', sqlPath, dbUrl];
}

function readTextCorpus(dir: string): string {
  return readdirSync(dir)
    .flatMap(entry => {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        return readTextCorpus(fullPath);
      }
      if (!fullPath.endsWith('.sql')) {
        return [];
      }
      return readFileSync(fullPath, 'utf8');
    })
    .join('\n');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    allowBlocked: false,
    rootDir: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--allow-blocked') {
      options.allowBlocked = true;
      continue;
    }

    if (arg === '--root') {
      options.rootDir = path.resolve(requireValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--db-url') {
      options.dbUrl = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function formatChecks(checks: Phase2Check[]): string {
  return checks.map(check => `${check.status.padEnd(4)} ${check.key}: ${check.detail}`).join('\n');
}

function runPsql(dbUrl: string, sqlPath: string): number {
  const result = spawnSync('psql', buildPsqlArgs(dbUrl, sqlPath), {
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`psql failed to start: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

export function runCli(argv: string[]): number {
  const options = parseArgs(argv);
  const checks = buildSourceChecks(options.rootDir);
  const sqlPath = sqlChecklistPath(options.rootDir);
  const hasFailure = checks.some(check => check.status === 'fail');

  console.log('Go Live Phase 2 local/source readiness');
  console.log(formatChecks(checks));
  console.log('');
  console.log(`Read-only database checklist: ${path.relative(options.rootDir, sqlPath)}`);

  if (options.dbUrl) {
    console.log('Executing read-only database checklist via psql.');
    const dbStatus = runPsql(options.dbUrl, sqlPath);
    if (dbStatus !== 0) {
      return dbStatus;
    }
  } else {
    console.log('No --db-url supplied; database evidence not collected.');
    console.log('Run with: pnpm qa:go-live:phase2 --db-url "$DATABASE_URL"');
  }

  return hasFailure && !options.allowBlocked ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
