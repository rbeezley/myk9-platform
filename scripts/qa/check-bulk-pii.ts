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
import { existsSync, readFileSync, statSync } from 'node:fs';
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

export type BulkPiiScan = {
  findings: BulkPiiFinding[];
  /**
   * Files git listed that could not be read.
   *
   * Reported rather than swallowed. A silent `catch` here is what hid the
   * quoted-filename bypass: git named a file, the open failed, and the guard
   * counted it as clean. Anything git lists at HEAD should be readable, so an
   * entry in here means the scan did NOT cover that file and someone should
   * look.
   */
  unreadable: string[];
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
): BulkPiiScan {
  const findings: BulkPiiFinding[] = [];
  const unreadable: string[] = [];
  for (const file of files) {
    if (!isScannable(file) || isGrandfathered(file)) continue;
    let content: string;
    try {
      content = readFile(file);
    } catch {
      unreadable.push(file);
      continue;
    }
    const distinctAddresses = countDistinctRealAddresses(content);
    if (distinctAddresses >= threshold) findings.push({ file, distinctAddresses });
  }
  findings.sort((a, b) => b.distinctAddresses - a.distinctAddresses);
  return { findings, unreadable };
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
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

/**
 * Split git's `-z` output.
 *
 * `-z` is not optional. Git QUOTES any path containing non-ASCII bytes by
 * default (`docs/résumé.csv` comes back as `"docs/r\303\251sum\303\251.csv"`),
 * and a quoted path cannot be opened — so the read failed, the failure was
 * swallowed, and the file reported clean. A tracked `résumé.csv` holding twelve
 * addresses was a complete bypass, `--all` included.
 */
function splitNul(output: string): string[] {
  return output.split('\0').filter(Boolean);
}

/** True when `ref` names a commit that exists in this clone. */
function commitExists(ref: string, repoRoot: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** git's "no parent" sentinel, sent on a branch's first push. */
const NULL_SHA = '0000000000000000000000000000000000000000';

/**
 * Files added or modified by the change under test.
 *
 * THREE bases, because getting this wrong makes the guard pass vacuously:
 *
 *  - A PR: diff against the merge base with the target branch.
 *  - A PUSH: diff against `github.event.before`. This arm is why the guard is
 *    worth anything. On a push run the workflow checks out main itself, so
 *    `origin/main` IS `HEAD`, the merge base equals `HEAD`, and the diff is
 *    empty — the guard scanned zero files and reported clean on every
 *    direct-to-main commit. That is precisely the path it was built to watch:
 *    this repo has a docs-only direct-to-main flow, and the unattended report
 *    updates it targets travel it.
 *  - Neither resolvable: scan every tracked file. Scanning too much is a safe
 *    failure; scanning nothing is not.
 *
 * The same reasoning covers a base that equals HEAD or names a commit this
 * clone does not have (a force-push, a shallow fetch): fall back to the full
 * scan rather than silently comparing a commit against itself.
 */
export function resolveFilesToScan(
  repoRoot: string,
  scanAll: boolean,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (!scanAll) {
    const range = resolveDiffRange(repoRoot, env);
    if (range) {
      return splitNul(
        git(['diff', '--name-only', '-z', '--diff-filter=ACMR', range, '--'], repoRoot)
      );
    }
  }
  return splitNul(git(['ls-files', '-z'], repoRoot));
}

/** The git range to diff, or null when no usable base exists. */
export function resolveDiffRange(repoRoot: string, env: NodeJS.ProcessEnv): string | null {
  const head = safeGit(['rev-parse', 'HEAD'], repoRoot);
  if (!head) return null;

  const baseRef = env.GITHUB_BASE_REF;
  if (baseRef) {
    const base = safeGit(['merge-base', `origin/${baseRef}`, 'HEAD'], repoRoot);
    if (base && base !== head) return `${base}...HEAD`;
  }

  const pushBase = env.GITHUB_EVENT_BEFORE;
  if (pushBase && pushBase !== NULL_SHA && pushBase !== head && commitExists(pushBase, repoRoot)) {
    // Two-dot: what actually changed between the pushed commits, not what the
    // branch accumulated since some shared ancestor.
    return `${pushBase}..HEAD`;
  }

  const localBase = safeGit(['merge-base', 'origin/main', 'HEAD'], repoRoot);
  if (localBase && localBase !== head) return `${localBase}...HEAD`;

  return null;
}

function safeGit(args: string[], repoRoot: string): string | null {
  try {
    const out = git(args, repoRoot).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** True when the tracked path resolves to a directory (a symlink to one, or a gitlink). */
export function isDirectoryEntry(repoRoot: string, file: string): boolean {
  try {
    return statSync(join(repoRoot, file)).isDirectory();
  } catch {
    return false; // unreadable for some other reason — let the scan report it
  }
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

  // Some tracked entries are symlinks to directories (the shared skill trees at
  // .claude/skills/*, mode 120000). Reading one is EISDIR — a legitimate miss,
  // not a bypass, and their contents are tracked elsewhere. Excluded by an
  // explicit test rather than by loosening the unreadable check below, which
  // has to stay strict: that check is what surfaces a real read failure instead
  // of counting it as clean.
  const files = resolveFilesToScan(repoRoot, scanAll).filter(file => !isDirectoryEntry(repoRoot, file));
  const { findings, unreadable } = scanForBulkPii(files, file =>
    readFileSync(join(repoRoot, file), 'utf8')
  );

  if (unreadable.length > 0) {
    console.error(
      `Bulk-PII guard: ${unreadable.length} file(s) git listed could not be read, so they were NOT scanned:`
    );
    for (const file of unreadable) console.error(`  - ${file}`);
    console.error('Investigate before trusting this run — an unscanned file is not a clean file.');
    return 1;
  }

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
