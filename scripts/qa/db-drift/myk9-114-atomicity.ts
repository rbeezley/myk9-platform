import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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

const migrationPath = resolve(
  findWorkspaceRoot(),
  'supabase/migrations/20260728210000_materialize_entry_access_context.sql'
);
const databaseUrl =
  process.env.MYK9_114_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function query(sql: string): string {
  return execFileSync('psql', [databaseUrl, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

const beforeViewHash = query(
  "select md5(pg_get_viewdef('public.view_authenticated_entry_results'::regclass, true))"
);
const beforeViewAcl = query(
  "select coalesce(relacl::text, '') from pg_class where oid = 'public.view_authenticated_entry_results'::regclass"
);
const beforeHelper = query(
  "select to_regprocedure('private.entry_results_caller_context()') is not null"
);

const migration = readFileSync(migrationPath, 'utf8');
const failureMarker =
  "DO $myk9_114_failure$ BEGIN RAISE EXCEPTION 'MYK9-114 injected rollback proof'; END $myk9_114_failure$;\n\nCOMMIT;";
if (!migration.endsWith('COMMIT;\n')) {
  throw new Error('Migration must end with COMMIT before atomicity can be tested');
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'myk9-114-atomicity-'));
const failureMigration = join(temporaryDirectory, 'injected-failure.sql');

try {
  writeFileSync(failureMigration, migration.replace(/COMMIT;\n$/, failureMarker), 'utf8');
  const apply = spawnSync(
    'psql',
    [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', failureMigration],
    { encoding: 'utf8' }
  );

  if (apply.status === 0 || !apply.stderr.includes('MYK9-114 injected rollback proof')) {
    throw new Error(`Injected migration did not fail as expected:\n${apply.stderr}`);
  }

  const afterViewHash = query(
    "select md5(pg_get_viewdef('public.view_authenticated_entry_results'::regclass, true))"
  );
  const afterViewAcl = query(
    "select coalesce(relacl::text, '') from pg_class where oid = 'public.view_authenticated_entry_results'::regclass"
  );
  const afterHelper = query(
    "select to_regprocedure('private.entry_results_caller_context()') is not null"
  );

  if (
    afterViewHash !== beforeViewHash ||
    afterViewAcl !== beforeViewAcl ||
    afterHelper !== beforeHelper
  ) {
    throw new Error(
      [
        'Atomicity proof failed:',
        `view hash ${beforeViewHash} -> ${afterViewHash}`,
        `view ACL ${beforeViewAcl} -> ${afterViewAcl}`,
        `helper existed ${beforeHelper} -> ${afterHelper}`,
      ].join('\n')
    );
  }

  process.stdout.write('MYK9-114 atomicity proof passed\n');
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
