// Single-show restore from a decrypted independent export (MYK9-110 drill 4).
// Default is a dry run: it reads the decrypted export, prints the plan and row counts, and
// touches no database. See docs/operations/independent-database-drills.md.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertManifest } from './export-model';
import {
  buildPlan,
  cascadeClosure,
  formatSummary,
  parseCopyData,
  parseForeignKeys,
  selectShowRows,
} from './single-show-restore-model';
import {
  buildPgRestoreArgs,
  buildPsqlInvocation,
  writePlanFile,
  DATA_ONLY_ARGS,
  SCHEMA_ONLY_ARGS,
} from './single-show-restore-commands';
import {
  parseRestoreArgs,
  targetConnection,
  TARGET_URL_ENV,
  type RestoreArgs,
} from './single-show-restore-guards';

const CA_FILE = resolve(fileURLToPath(import.meta.url), '..', 'supabase-prod-ca-2021.crt');
const MAX_BUFFER = 1024 * 1024 * 1024;

function pgRestoreText(dumpPath: string, extra: string[]): string {
  const scratch = mkdtempSync(join(tmpdir(), 'myk9-show-restore-'));
  const target = join(scratch, 'out.sql');
  try {
    const result = spawnSync('pg_restore', buildPgRestoreArgs(extra, target, dumpPath), {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    });
    if (result.error || result.status !== 0) {
      throw new Error(`pg_restore failed: ${result.error?.message ?? result.stderr.slice(0, 500)}`);
    }
    return readFileSync(target, 'utf8');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function planFromExport(args: RestoreArgs) {
  const manifestPath = join(resolve(args.dir), 'manifest.json');
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assertManifest(manifest);
  const dumpPath = join(resolve(args.dir), 'database.dump');
  const keys = parseForeignKeys(pgRestoreText(dumpPath, SCHEMA_ONLY_ARGS));
  const closure = cascadeClosure(keys);
  const dataSql = pgRestoreText(dumpPath, DATA_ONLY_ARGS);
  const selection = selectShowRows(args.showId, keys, parseCopyData(dataSql, closure));
  return buildPlan(selection, keys, {
    showId: args.showId,
    sourceRef: manifest.projectRef,
    exportCreatedAt: manifest.createdAt,
    excludeTables: args.excludeTables,
    includeMoney: args.includeMoney,
  });
}

function execute(args: RestoreArgs, sql: string): void {
  const connection = targetConnection(process.env[TARGET_URL_ENV], args);
  console.log(
    `Executing against ${connection.host} as ${connection.user} (project ${args.targetRef})`
  );
  const psql = buildPsqlInvocation(connection, process.env, CA_FILE);
  const result = spawnSync('psql', psql.args, {
    input: sql, // BEGIN/COMMIT are in the plan; ON_ERROR_STOP aborts and the open transaction rolls back
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    env: psql.env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `psql failed (transaction rolled back): ${result.error?.message ?? result.stderr}`
    );
  }
  console.log(result.stdout);
}

function main(): void {
  const args = parseRestoreArgs(process.argv.slice(2));
  const plan = planFromExport(args);
  console.log(formatSummary(plan));
  if (args.out) {
    writePlanFile(resolve(args.out), plan.sql);
    console.log(`SQL plan written to ${resolve(args.out)} (contains data; delete after use)`);
  }
  if (!args.execute) {
    console.log(
      'DRY RUN: nothing was executed. Re-run with --execute --target-ref <ref> to apply. Money tables are excluded unless --include-money is passed.'
    );
    return;
  }
  execute(args, plan.sql);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
