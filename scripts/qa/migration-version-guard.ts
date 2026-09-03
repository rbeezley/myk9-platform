import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');

export function migrationVersion(file: string): string | null {
  return basename(file).match(/^(\d+)_.*\.sql$/)?.[1] ?? null;
}

export function changedMigrationVersions(files: string[]): string[] {
  return [...new Set(files.map(migrationVersion).filter((version): version is string => version !== null))].sort();
}

function changedMigrationFiles(): string[] {
  const baseRef = process.env.GITHUB_BASE_REF;
  const pushBase = process.env.GITHUB_EVENT_BEFORE;
  const range = baseRef ? `origin/${baseRef}...HEAD` : pushBase ? `${pushBase}...HEAD` : 'HEAD^...HEAD';
  const output = execFileSync('git', ['diff', '--name-only', range, '--', 'supabase/migrations'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return output.split('\n').filter(Boolean);
}

function refsContainingMigrationVersion(version: string): string[] {
  const refs = execFileSync('git', ['for-each-ref', '--format=%(refname)', 'refs/remotes', 'refs/heads'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).split('\n').filter(Boolean);

  return refs.filter((ref) => {
    const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', 'supabase/migrations'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return files.split('\n').some((file) => migrationVersion(file) === version);
  });
}

function liveMigrationCount(version: string): number {
  const databaseUrl = process.env.MYK9_MIGRATION_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('MYK9_MIGRATION_DATABASE_URL is required when migration files changed');
  }

  const sql = `select count(*) from supabase_migrations.schema_migrations where version = '${version}';`;
  const result = execFileSync('psql', [databaseUrl, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
  const count = Number(result);
  if (!Number.isInteger(count)) throw new Error(`Unexpected migration count for ${version}: ${result}`);
  return count;
}

export function runGuard(files: string[]): string[] {
  const versions = changedMigrationVersions(files);
  const errors: string[] = [];
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();

  for (const version of versions) {
    const refs = refsContainingMigrationVersion(version).filter((ref) => {
      const refSha = execFileSync('git', ['rev-parse', ref], { cwd: repoRoot, encoding: 'utf8' }).trim();
      return refSha !== headSha;
    });
    if (refs.length > 0) {
      errors.push(`migration version ${version} also exists on: ${refs.join(', ')}`);
    }
    if (liveMigrationCount(version) > 0) {
      errors.push(`migration version ${version} already exists in supabase_migrations.schema_migrations`);
    }
  }

  return errors;
}

if (process.argv[1]?.endsWith('migration-version-guard.ts')) {
  const files = changedMigrationFiles();
  if (files.length === 0) {
    console.log('Migration version guard: no migration files changed.');
    process.exit(0);
  }

  try {
    const errors = runGuard(files);
    if (errors.length > 0) {
      console.error(['Migration version guard failed:', ...errors].join('\n'));
      process.exit(1);
    }
    console.log(`Migration version guard passed for ${changedMigrationVersions(files).join(', ')}.`);
  } catch (error) {
    console.error(`Migration version guard could not complete: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
