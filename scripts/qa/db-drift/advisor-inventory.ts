import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export type AdvisorLevel = 'ERROR' | 'WARN' | 'INFO';

export type RawAdvisorLint = {
  name: string;
  title?: string;
  level: string;
  categories?: string[];
  detail?: string;
  remediation?: string;
  metadata?: Record<string, unknown>;
  cache_key?: string;
};

export type RawAdvisorResult = {
  result?: { lints?: RawAdvisorLint[] };
  lints?: RawAdvisorLint[];
};

export type AdvisorEntry = {
  code: string;
  level: AdvisorLevel;
  schema: string | null;
  objectName: string | null;
  /** Stable identity, e.g. `public.foo` or `public.foo(uuid, text)` for functions. */
  identity: string;
  detail: string;
};

export type AdvisorClassification = 'repository-owned' | 'extension-owned' | 'unclassified';

export type ClassifiedAdvisorEntry = AdvisorEntry & {
  classification: AdvisorClassification;
};

export type AdvisorInventoryConfig = {
  /** Object-name prefixes/exact names owned by third-party extensions, not the repo. */
  extensionOwnedObjects: string[];
  /** Schemas fully owned by Supabase/Postgres extensions and infrastructure, not the repo. */
  extensionOwnedSchemas: string[];
  /** Advisor codes that are always project-level exceptions regardless of object. */
  exceptionCodes: string[];
};

export const DEFAULT_CONFIG: AdvisorInventoryConfig = {
  extensionOwnedObjects: [
    'pg_stat_statements',
    'pg_stat_statements_info',
    'pgbouncer_config',
    'pg_buffercache',
    'http_request_queue',
  ],
  extensionOwnedSchemas: [
    'extensions',
    'pg_catalog',
    'information_schema',
    'cron',
    'net',
    'pgsodium',
    'pgbouncer',
    'realtime',
  ],
  exceptionCodes: [],
};

/**
 * Normalizes raw advisor CLI/MCP output (either `{ lints: [...] }` or
 * `{ result: { lints: [...] } }`) into a flat, stably-sortable entry list.
 */
export function normalizeAdvisorLints(raw: RawAdvisorResult): AdvisorEntry[] {
  const lints = raw.result?.lints ?? raw.lints ?? [];

  return lints
    .map(normalizeLint)
    .sort((a, b) => a.identity.localeCompare(b.identity) || a.code.localeCompare(b.code));
}

function normalizeLint(lint: RawAdvisorLint): AdvisorEntry {
  const metadata = lint.metadata ?? {};
  const schema = typeof metadata.schema === 'string' ? metadata.schema : null;
  const objectName = typeof metadata.name === 'string' ? metadata.name : null;
  const identity = buildIdentity({ schema, objectName, metadata });

  return {
    code: lint.name,
    level: normalizeLevel(lint.level),
    schema,
    objectName,
    identity,
    detail: lint.detail ?? '',
  };
}

function normalizeLevel(level: string): AdvisorLevel {
  const upper = level.toUpperCase();
  if (upper === 'ERROR' || upper === 'WARN' || upper === 'INFO') return upper;
  return 'INFO';
}

/**
 * Builds a stable object identity for diffing across re-runs. Functions get an
 * identity-argument signature (types only, names stripped) so overloads don't collide,
 * e.g. `public.foo(uuid, text)`. Non-function objects use `schema.name`.
 */
function buildIdentity({
  schema,
  objectName,
  metadata,
}: {
  schema: string | null;
  objectName: string | null;
  metadata: Record<string, unknown>;
}): string {
  const qualifiedName = [schema, objectName].filter(Boolean).join('.') || 'unknown';

  const rawArguments = metadata.arguments;
  if (typeof rawArguments === 'string') {
    const signature = normalizeArgumentSignature(rawArguments);
    return `${qualifiedName}(${signature})`;
  }

  const fkeyName = metadata.fkey_name;
  if (typeof fkeyName === 'string') {
    return `${qualifiedName}#${fkeyName}`;
  }

  const indexName = metadata.index_name ?? metadata.name_2;
  if (typeof indexName === 'string' && indexName !== objectName) {
    return `${qualifiedName}#${indexName}`;
  }

  return qualifiedName;
}

/** Strips parameter names/defaults, keeping only comma-separated types: `p_route text` -> `text`. */
function normalizeArgumentSignature(rawArguments: string): string {
  if (!rawArguments.trim()) return '';

  return rawArguments
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const withoutDefault = part.split('=')[0]?.trim() ?? part;
      const tokens = withoutDefault.split(/\s+/);
      // Single token means it's already just a type (no arg name given).
      return tokens.length > 1 ? tokens.slice(1).join(' ') : tokens[0];
    })
    .join(', ');
}

/**
 * Classifies each entry as repository-owned (lives in our schema/migrations, must be
 * disposed of explicitly) or extension/system-owned (out of our control, informational).
 */
export function classifyAdvisorEntries(
  entries: AdvisorEntry[],
  config: AdvisorInventoryConfig = DEFAULT_CONFIG
): ClassifiedAdvisorEntry[] {
  return entries.map(entry => ({
    ...entry,
    classification: classifyEntry(entry, config),
  }));
}

function classifyEntry(entry: AdvisorEntry, config: AdvisorInventoryConfig): AdvisorClassification {
  if (config.exceptionCodes.includes(entry.code)) {
    return 'repository-owned';
  }

  if (entry.schema && config.extensionOwnedSchemas.includes(entry.schema)) {
    return 'extension-owned';
  }

  if (entry.objectName && config.extensionOwnedObjects.includes(entry.objectName)) {
    return 'extension-owned';
  }

  if (!entry.schema && !entry.objectName) {
    // Project-level advisories (e.g. auth_allow_anonymous_sign_ins, connection limits)
    // have no object identity; they're repository/project-owned by default.
    return 'repository-owned';
  }

  // Repo-managed schemas: our own app tables/functions plus Supabase-managed schemas
  // whose contents we still author policies/grants against (auth, storage, vault).
  const repoSchemas = new Set(['public', 'storage', 'graphql_public', 'auth', 'vault']);
  if (entry.schema && repoSchemas.has(entry.schema)) {
    return 'repository-owned';
  }

  return 'unclassified';
}

export type AdvisorSummary = {
  total: number;
  byLevel: Record<AdvisorLevel, number>;
  byClassification: Record<AdvisorClassification, number>;
};

export function summarizeAdvisorEntries(entries: ClassifiedAdvisorEntry[]): AdvisorSummary {
  const byLevel: Record<AdvisorLevel, number> = { ERROR: 0, WARN: 0, INFO: 0 };
  const byClassification: Record<AdvisorClassification, number> = {
    'repository-owned': 0,
    'extension-owned': 0,
    unclassified: 0,
  };

  for (const entry of entries) {
    byLevel[entry.level] += 1;
    byClassification[entry.classification] += 1;
  }

  return { total: entries.length, byLevel, byClassification };
}

export function findUnclassifiedRepositoryOwned(
  entries: ClassifiedAdvisorEntry[]
): ClassifiedAdvisorEntry[] {
  return entries.filter(entry => entry.classification === 'unclassified');
}

export type AdvisorSnapshot = {
  version: 1;
  capturedAt: string;
  summary: AdvisorSummary;
  entries: ClassifiedAdvisorEntry[];
};

export function buildAdvisorSnapshot(
  entries: ClassifiedAdvisorEntry[],
  capturedAt = new Date().toISOString()
): AdvisorSnapshot {
  return {
    version: 1,
    capturedAt,
    summary: summarizeAdvisorEntries(entries),
    entries,
  };
}

export function writeAdvisorSnapshot(path: string, snapshot: AdvisorSnapshot) {
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export function readAdvisorSnapshot(path: string): AdvisorSnapshot {
  return JSON.parse(readFileSync(path, 'utf8')) as AdvisorSnapshot;
}

export function loadRawAdvisorFile(path: string): RawAdvisorResult {
  return JSON.parse(readFileSync(path, 'utf8')) as RawAdvisorResult;
}

/**
 * CLI entrypoint: combines security + performance raw advisor exports into one
 * normalized/classified snapshot, fails on any unclassified repository-owned entry.
 *
 * Usage:
 *   tsx scripts/qa/db-drift/advisor-inventory.ts \
 *     --security=path/to/raw-security.json \
 *     --performance=path/to/raw-performance.json \
 *     --out=path/to/snapshot.json
 */
export function runCli(args: string[] = process.argv.slice(2)) {
  const securityPath = argValue(args, '--security');
  const performancePath = argValue(args, '--performance');
  const outPath = argValue(args, '--out');

  if (!securityPath || !performancePath) {
    console.error('Usage: advisor-inventory --security=<file> --performance=<file> [--out=<file>]');
    return 1;
  }

  if (!existsSync(securityPath) || !existsSync(performancePath)) {
    console.error('Advisor export file(s) not found. Fetch them first (see README).');
    return 1;
  }

  const security = normalizeAdvisorLints(loadRawAdvisorFile(securityPath));
  const performance = normalizeAdvisorLints(loadRawAdvisorFile(performancePath));
  const classified = classifyAdvisorEntries([...security, ...performance]);
  const snapshot = buildAdvisorSnapshot(classified);

  console.log(
    `Advisor inventory: ${snapshot.summary.total} entries ` +
      `(ERROR ${snapshot.summary.byLevel.ERROR}, WARN ${snapshot.summary.byLevel.WARN}, INFO ${snapshot.summary.byLevel.INFO})`
  );
  console.log(
    `Classification: repository-owned ${snapshot.summary.byClassification['repository-owned']}, ` +
      `extension-owned ${snapshot.summary.byClassification['extension-owned']}, ` +
      `unclassified ${snapshot.summary.byClassification.unclassified}`
  );

  if (outPath) {
    writeAdvisorSnapshot(outPath, snapshot);
    console.log(`Wrote ${outPath}`);
  }

  const unclassifiedRepoOwned = findUnclassifiedRepositoryOwned(classified);
  if (unclassifiedRepoOwned.length > 0) {
    console.error(
      `\nFAIL: ${unclassifiedRepoOwned.length} unclassified repository-owned advisor entr${
        unclassifiedRepoOwned.length === 1 ? 'y' : 'ies'
      }:`
    );
    for (const entry of unclassifiedRepoOwned) {
      console.error(`  - [${entry.code}] ${entry.identity}`);
    }
    return 1;
  }

  return 0;
}

function argValue(args: string[], flag: string): string | undefined {
  return args
    .find(arg => arg.startsWith(`${flag}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(runCli());
}
