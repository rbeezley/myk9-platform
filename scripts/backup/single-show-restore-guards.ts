// Argument parsing and target safety for single-show-restore.ts. Pure, so every refusal is
// unit-tested. The target connection string never travels on the command line: it is read from
// RESTORE_TARGET_DATABASE_URL so it cannot appear in process listings or shell history.

export const PRODUCTION_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';
export const TARGET_URL_ENV = 'RESTORE_TARGET_DATABASE_URL';
export const PRODUCTION_FLAG = '--i-understand-this-is-production';

export interface RestoreArgs {
  dir: string;
  showId: string;
  execute: boolean;
  targetRef: string | undefined;
  allowProduction: boolean;
  out: string | undefined;
  excludeTables: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALUE_OPTIONS = ['--dir', '--show-id', '--target-ref', '--out', '--exclude-table'] as const;
const FLAG_OPTIONS = ['--dry-run', '--execute', PRODUCTION_FLAG] as const;

export function parseRestoreArgs(argv: string[]): RestoreArgs {
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const option = argv[i];
    if ((FLAG_OPTIONS as readonly string[]).includes(option)) {
      flags.add(option);
    } else if ((VALUE_OPTIONS as readonly string[]).includes(option)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
      const list = values.get(option) ?? [];
      if (option !== '--exclude-table' && list.length)
        throw new Error(`${option} may only be given once`);
      values.set(option, [...list, value]);
      i += 1;
    } else {
      throw new Error(`unknown option: ${option}`);
    }
  }
  if (flags.has('--dry-run') && flags.has('--execute')) {
    throw new Error('--dry-run and --execute are mutually exclusive');
  }
  const dir = values.get('--dir')?.[0];
  const showId = values.get('--show-id')?.[0];
  if (!dir) throw new Error('--dir (decrypted export directory) is required');
  if (!showId || !UUID.test(showId)) throw new Error('--show-id must be a show UUID');
  const args: RestoreArgs = {
    dir,
    showId: showId.toLowerCase(),
    execute: flags.has('--execute'),
    targetRef: values.get('--target-ref')?.[0],
    allowProduction: flags.has(PRODUCTION_FLAG),
    out: values.get('--out')?.[0],
    excludeTables: values.get('--exclude-table') ?? [],
  };
  assertTargetAllowed(args);
  return args;
}

/** Refuses production without the explicit flag and an execute run without an explicit target. */
export function assertTargetAllowed(args: RestoreArgs): void {
  if (args.targetRef === PRODUCTION_PROJECT_REF && !args.allowProduction) {
    throw new Error(
      `refusing to target production project ${PRODUCTION_PROJECT_REF}; ${PRODUCTION_FLAG} is required and is only for an approved incident`
    );
  }
  if (args.allowProduction && args.targetRef !== PRODUCTION_PROJECT_REF) {
    throw new Error(`${PRODUCTION_FLAG} only applies with --target-ref ${PRODUCTION_PROJECT_REF}`);
  }
  if (args.execute && !args.targetRef) {
    throw new Error(`--execute requires an explicit --target-ref and ${TARGET_URL_ENV}`);
  }
}

export interface TargetConnection {
  env: Record<string, string>;
  host: string;
  user: string;
}

/**
 * Builds libpq environment variables from the target URL and proves the URL points at the ref
 * the operator named (host `db.<ref>.supabase.co` or pooler user `postgres.<ref>`). A URL that
 * names the production ref is refused unless production was explicitly allowed.
 */
export function targetConnection(url: string | undefined, args: RestoreArgs): TargetConnection {
  if (!url) throw new Error(`${TARGET_URL_ENV} is required with --execute`);
  if (!args.targetRef) throw new Error('--target-ref is required with --execute');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${TARGET_URL_ENV} is not a valid postgres URL`);
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${TARGET_URL_ENV} must be a postgresql:// URL`);
  }
  const host = parsed.hostname;
  const user = decodeURIComponent(parsed.username);
  const names = (ref: string): boolean => host.includes(ref) || user.endsWith(`.${ref}`);
  if (names(PRODUCTION_PROJECT_REF) && !args.allowProduction) {
    throw new Error(`${TARGET_URL_ENV} points at production; refusing without ${PRODUCTION_FLAG}`);
  }
  if (!names(args.targetRef)) {
    throw new Error(`${TARGET_URL_ENV} does not name project ${args.targetRef}; refusing`);
  }
  const env: Record<string, string> = {
    PGHOST: host,
    PGPORT: parsed.port || '5432',
    PGUSER: user,
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'postgres',
    PGSSLMODE: 'verify-full',
  };
  return { env, host, user };
}
