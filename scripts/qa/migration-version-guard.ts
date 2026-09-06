import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');
export function migrationVersion(file: string): string | null {
  return basename(file).match(/^(\d+)_.*\.sql$/)?.[1] ?? null;
}
export function changedMigrationVersions(files: string[]): string[] {
  return [...new Set(files.map(migrationVersion).filter((v): v is string => v !== null))].sort();
}
export function currentBranchName(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || undefined;
}
export function isCurrentBranchRef(ref: string, branch: string | undefined): boolean {
  return !!branch && (ref === `refs/remotes/origin/${branch}` || ref === `refs/heads/${branch}`);
}

// Deliberately support only leading blank/line-comment headers. Preserve every
// executable byte, including whitespace, literals, and comments within SQL.
export function migrationBody(source: string): string {
  return source.replace(/^(?:(?:[ \t]*--[^\n]*|[ \t]*)\r?\n)*/, '');
}
interface GuardOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  command?: (command: string, args: string[]) => string;
}
export function runGuard(files: string[], options: GuardOptions = {}): string[] {
  const env = options.env ?? process.env;
  const command =
    options.command ??
    ((name, args) =>
      execFileSync(name, args, {
        cwd: options.cwd ?? repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }));
  const git = (...args: string[]) => command('git', args).trim();
  const tree = (ref: string) =>
    git('ls-tree', '-r', '--name-only', ref, '--', 'supabase/migrations')
      .split('\n')
      .filter(file => migrationVersion(file) !== null);
  const source = (ref: string, path: string) => command('git', ['show', `${ref}:${path}`]);
  const same = (a: string, b: string, path: string) =>
    migrationBody(source(a, path)) === migrationBody(source(b, path));
  const versions = changedMigrationVersions(files);
  if (!versions.length) return [];
  // Missing main or base provenance is a hard error, never an allow fallback.
  const main = 'refs/remotes/origin/main';
  const mainFiles = tree(main);
  const base = env.GITHUB_BASE_REF
    ? git('merge-base', `origin/${env.GITHUB_BASE_REF}`, 'HEAD')
    : env.GITHUB_EVENT_BEFORE || git('rev-parse', 'HEAD^');
  const baseFiles = tree(base);
  const headFiles = tree('HEAD');
  const headSha = git('rev-parse', 'HEAD');
  const refs = git('for-each-ref', '--format=%(refname)', 'refs/remotes', 'refs/heads')
    .split('\n')
    .filter(Boolean);
  const refTrees = refs.map(ref => ({ ref, files: tree(ref), sha: git('rev-parse', ref) }));
  const errors: string[] = [];
  // Check the whole candidate tree; callers cannot hide a duplicate by listing
  // just one of its paths in the diff.
  for (const version of changedMigrationVersions(headFiles)) {
    const claims = headFiles.filter(file => migrationVersion(file) === version);
    if (claims.length > 1)
      errors.push(`duplicate migration version ${version}: ${claims.join(', ')}`);
  }
  for (const version of versions) {
    const claims = headFiles.filter(file => migrationVersion(file) === version);
    const historical = [...new Set([...baseFiles, ...mainFiles])].filter(
      file => migrationVersion(file) === version
    );
    for (const path of historical) {
      if (!headFiles.includes(path))
        errors.push(`migration ${version} removed or renamed accepted path ${path}`);
    }
    for (const path of claims) {
      const accepted = mainFiles.includes(path) && same('HEAD', main, path);
      if (mainFiles.includes(path) && !accepted) {
        errors.push(`migration ${version} changed accepted main body: ${path}`);
      }
      if (baseFiles.includes(path) && !same('HEAD', base, path)) {
        errors.push(`migration ${version} changed accepted base body: ${path}`);
      }
      for (const other of refTrees) {
        if (isCurrentBranchRef(other.ref, currentBranchName(env)) || other.sha === headSha)
          continue;
        for (const otherPath of other.files.filter(file => migrationVersion(file) === version)) {
          const inherited =
            otherPath === path &&
            same('HEAD', other.ref, path) &&
            (accepted || (baseFiles.includes(path) && same('HEAD', base, path)));
          if (!inherited)
            errors.push(
              `migration version ${version} conflicts with ${other.ref}: ${otherPath} (candidate ${path})`
            );
        }
      }
      const databaseUrl = env.MYK9_MIGRATION_DATABASE_URL;
      if (!databaseUrl)
        throw new Error(`MYK9_MIGRATION_DATABASE_URL is required to verify migration ${version}`);
      const result = command('psql', [
        databaseUrl,
        '-X',
        '-A',
        '-t',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `select count(*) from supabase_migrations.schema_migrations where version = '${version}';`,
      ]).trim();
      const count = Number(result);
      if (!/^\d+$/.test(result) || !Number.isSafeInteger(count))
        throw new Error(`Unexpected migration count for ${version}: ${result}`);
      if (count > 0 && !accepted)
        errors.push(`migration ${version} is deployed without accepted main identity: ${path}`);
    }
  }
  return errors;
}

function changedMigrationFiles(): string[] {
  const base = process.env.GITHUB_BASE_REF;
  const before = process.env.GITHUB_EVENT_BEFORE;
  const range = base ? `origin/${base}...HEAD` : before ? `${before}..HEAD` : 'HEAD^..HEAD';
  return execFileSync('git', ['diff', '--name-only', range, '--', 'supabase/migrations'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
}
if (process.argv[1]?.endsWith('migration-version-guard.ts')) {
  try {
    const files = changedMigrationFiles();
    const errors = runGuard(files);
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(
      `Migration version guard passed${files.length ? ` for ${changedMigrationVersions(files).join(', ')}` : ': no migration files changed'}.`
    );
  } catch (error) {
    console.error(
      `Migration version guard failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
