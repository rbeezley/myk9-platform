/**
 * Bulk-PII guard — block committing a data EXPORT, not an email address.
 *
 * WHY A THRESHOLD AND NOT A MATCH. The obvious version of this check ("fail on
 * any consumer-domain address in a tracked file") is the wrong shape for this
 * repo: it fires on seed fixtures, on runbooks naming one contact, on docs
 * quoting an example, and therefore ships with a large exemption list that only
 * ever grows. LESSONS already records where that ends — a checker whose own
 * allowlist swallowed the thing it was checking, fixed by DELETING the
 * heuristic rather than refining it. So this counts DISTINCT addresses per file
 * and fires only at export scale, which ordinary code and prose never reach:
 *
 *   docs/mySWT/tbl_History.txt          72 addresses  -> an export
 *   docs/mySWT/tbl_Email_Temporary.txt  41 addresses  -> an export
 *   a runbook naming one contact         1 address    -> fine
 *   a fixture with a handful of users    3 addresses  -> fine
 *
 * Unlike a prose rule ("never write real PII into a report"), the threshold
 * cannot be satisfied by rewording: ten real addresses in a comment are still
 * ten real addresses.
 *
 * WHAT IT PROTECTS. This repository is worked by unattended agents that commit
 * on a schedule — QA walks, audits and screenshot runs that write their output
 * back into the repo. Today those run against seeded staging accounts. Once the
 * database holds real exhibitors, the same automation is one findings file away
 * from committing their names and addresses, with nobody reading the diff.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A file may carry this many distinct real addresses before it reads as an export. */
export const BULK_PII_THRESHOLD = 10;

/**
 * Domains whose addresses are synthetic by construction, so they never count.
 *
 * This is the ONE list that is allowed to grow, and it is safe to grow: every
 * entry is a domain nobody receives mail at. It is not an exemption from the
 * check — a file full of `example.com` addresses is not a leak.
 */
export const SYNTHETIC_EMAIL_DOMAINS: readonly string[] = [
  'example.com',
  'example.org',
  'example.net',
  'myk9t.com',
  'test.myk9.com',
  'localhost',
];

/** Domain suffixes that are synthetic by convention (RFC 2606 and friends). */
const SYNTHETIC_DOMAIN_SUFFIXES: readonly string[] = ['.test', '.invalid', '.example', '.local'];

/**
 * Paths that predate this guard and are known to be test data.
 *
 * Deliberately PATHS, not addresses: grandfathering a directory is one line and
 * stays one line, whereas listing addresses would grow with every import and
 * would quietly become the place real ones get parked. Kept honest by
 * `assertGrandfatheredPathsExist` — a stale entry fails the check rather than
 * sitting here forever granting an exemption nothing needs.
 */
export const GRANDFATHERED_PREFIXES: readonly string[] = [
  // Legacy mySWT reference export. Confirmed test exhibitors (owner, 2026-09-05).
  'docs/mySWT/',
];

/** Extensions we never scan: binary, or generated and enormous. */
const SKIPPED_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.svg',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.webm',
  '.zip',
  '.gz',
  '.lock',
  '.lockb',
];

const SKIPPED_PATH_SEGMENTS: readonly string[] = ['node_modules/', 'dist/', '.git/'];

/**
 * Source-code test files, which are synthetic by construction.
 *
 * Same rationale as `example.com`, not an exemption: a unit test naming 33 made-up
 * clubs (`a@club.com`, `club1@test.com`) is fixture data, and a guard that fires
 * on it is a guard people switch off. Matched on the FILE SUFFIX only — a data
 * file such as `__tests__/fixtures/people.json` is still scanned, because a real
 * export dropped into a test directory is exactly the accident worth catching.
 */
const TEST_SOURCE_SUFFIXES: readonly string[] = [
  '.test.ts',
  '.test.tsx',
  '.test.js',
  '.spec.ts',
  '.spec.tsx',
  '.spec.js',
];

// Deliberately permissive on the local part and strict on the domain: we are
// counting things that look like deliverable mail, not validating addresses.
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export type BulkPiiFinding = {
  file: string;
  distinctAddresses: number;
};

/** True when an address's domain is synthetic and therefore not a person. */
export function isSyntheticAddress(address: string): boolean {
  const domain = address.slice(address.lastIndexOf('@') + 1).toLowerCase();
  if (SYNTHETIC_EMAIL_DOMAINS.includes(domain)) return true;
  return SYNTHETIC_DOMAIN_SUFFIXES.some(suffix => domain.endsWith(suffix));
}

/** Distinct, case-insensitive, non-synthetic addresses in one blob of text. */
export function countDistinctRealAddresses(content: string): number {
  const seen = new Set<string>();
  for (const match of content.match(EMAIL_PATTERN) ?? []) {
    const address = match.toLowerCase();
    if (!isSyntheticAddress(address)) seen.add(address);
  }
  return seen.size;
}

export function isGrandfathered(file: string): boolean {
  return GRANDFATHERED_PREFIXES.some(prefix => file.startsWith(prefix));
}

export function isScannable(file: string): boolean {
  if (SKIPPED_PATH_SEGMENTS.some(segment => file.includes(segment))) return false;
  const lower = file.toLowerCase();
  if (SKIPPED_EXTENSIONS.some(ext => lower.endsWith(ext))) return false;
  if (TEST_SOURCE_SUFFIXES.some(suffix => lower.endsWith(suffix))) return false;
  // This file necessarily contains the words it forbids.
  if (file === 'scripts/qa/check-bulk-pii.ts') return false;
  return true;
}

/**
 * Scan a set of repo-relative paths. `readFile` is injected so the whole
 * decision is testable without touching the filesystem.
 */
export function scanForBulkPii(
  files: readonly string[],
  readFile: (file: string) => string,
  threshold: number = BULK_PII_THRESHOLD
): BulkPiiFinding[] {
  const findings: BulkPiiFinding[] = [];
  for (const file of files) {
    if (!isScannable(file) || isGrandfathered(file)) continue;
    let content: string;
    try {
      content = readFile(file);
    } catch {
      continue; // deleted between diff and read, or unreadable — not our failure
    }
    const distinctAddresses = countDistinctRealAddresses(content);
    if (distinctAddresses >= threshold) findings.push({ file, distinctAddresses });
  }
  return findings.sort((a, b) => b.distinctAddresses - a.distinctAddresses);
}

/**
 * A grandfathered prefix that matches nothing is a standing exemption for code
 * that no longer exists — exactly the silent-allowlist decay this guard is
 * supposed to avoid, so it is an error rather than a shrug.
 */
export function assertGrandfatheredPathsExist(
  repoRoot: string,
  exists: (path: string) => boolean = existsSync
): string[] {
  return GRANDFATHERED_PREFIXES.filter(prefix => !exists(join(repoRoot, prefix)));
}

function git(args: string[], repoRoot: string): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

/**
 * Files added or modified relative to the merge base with origin/main.
 *
 * Diff-scoped on purpose: the guard is about what a change INTRODUCES, so it
 * neither re-litigates history nor slows down as the repo grows. Falls back to
 * every tracked file when there is no usable base (a fresh clone, a detached
 * checkout), because scanning too much is a safe failure and scanning nothing
 * is not.
 */
export function resolveFilesToScan(repoRoot: string, scanAll: boolean): string[] {
  if (!scanAll) {
    try {
      const base = git(['merge-base', 'origin/main', 'HEAD'], repoRoot);
      if (base) {
        const out = git(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`], repoRoot);
        return out ? out.split('\n').filter(Boolean) : [];
      }
    } catch {
      // fall through to the full scan
    }
  }
  const tracked = git(['ls-files'], repoRoot);
  return tracked ? tracked.split('\n').filter(Boolean) : [];
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  const repoRoot = process.cwd();
  const scanAll = argv.includes('--all');

  const staleExemptions = assertGrandfatheredPathsExist(repoRoot);
  if (staleExemptions.length > 0) {
    console.error('Bulk-PII guard: grandfathered path no longer exists, so its exemption is dead:');
    for (const prefix of staleExemptions) console.error(`  - ${prefix}`);
    console.error('Remove it from GRANDFATHERED_PREFIXES in scripts/qa/check-bulk-pii.ts.');
    return 1;
  }

  const files = resolveFilesToScan(repoRoot, scanAll);
  const findings = scanForBulkPii(files, file => readFileSync(join(repoRoot, file), 'utf8'));

  if (findings.length === 0) {
    console.log(
      `Bulk-PII guard: clean (${files.length} file${files.length === 1 ? '' : 's'} scanned, ` +
        `threshold ${BULK_PII_THRESHOLD} distinct real addresses).`
    );
    return 0;
  }

  console.error('Bulk-PII guard: these files look like personal-data exports.\n');
  for (const finding of findings) {
    console.error(`  ${finding.file} — ${finding.distinctAddresses} distinct real email addresses`);
  }
  console.error(
    '\nThis repository is public, and a commit is permanent: removing the file later does ' +
      'not remove it from history, from clones, or from forks.\n' +
      'If this is real exhibitor data, do NOT commit it — keep the export outside the repo.\n' +
      'If it is genuinely test data, add its path to GRANDFATHERED_PREFIXES in ' +
      'scripts/qa/check-bulk-pii.ts, with a comment saying who confirmed that and when.'
  );
  return 1;
}

/* c8 ignore start — CLI entry, exercised by the workflow rather than by tests */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
/* c8 ignore stop */
