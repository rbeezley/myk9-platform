import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  BULK_PII_THRESHOLD,
  GRANDFATHERED_PREFIXES,
  assertGrandfatheredPathsExist,
  countDistinctRealAddresses,
  isGrandfathered,
  isScannable,
  isSyntheticAddress,
  resolveDiffRange,
  resolveFilesToScan,
  scanForBulkPii,
} from './check-bulk-pii';

/** Build a blob holding `count` distinct addresses at `domain`. */
function exportOf(count: number, domain = 'gmail.com'): string {
  return Array.from({ length: count }, (_, i) => `person${i}@${domain}`).join('\n');
}

describe('countDistinctRealAddresses', () => {
  it('counts distinct real addresses, not occurrences', () => {
    const repeated = 'a@gmail.com\na@gmail.com\na@gmail.com\nb@yahoo.com';
    expect(countDistinctRealAddresses(repeated)).toBe(2);
  });

  it('is case-insensitive, so casing cannot inflate or evade the count', () => {
    expect(countDistinctRealAddresses('Sam@Gmail.com\nsam@gmail.com')).toBe(1);
  });

  it('ignores synthetic domains', () => {
    // A seed fixture with many users must never trip the guard.
    expect(countDistinctRealAddresses(exportOf(40, 'example.com'))).toBe(0);
    expect(countDistinctRealAddresses(exportOf(40, 'myk9t.com'))).toBe(0);
    expect(countDistinctRealAddresses(exportOf(40, 'acme.test'))).toBe(0);
  });

  it('counts club and organisation domains, which are real people', () => {
    // The failure mode is not limited to consumer webmail: a club's own domain
    // is still a deliverable address belonging to a person.
    expect(countDistinctRealAddresses(exportOf(3, 'heartlandscentwork.org'))).toBe(3);
  });

  it('finds nothing in ordinary prose', () => {
    expect(countDistinctRealAddresses('Cancel the subscription from the Stripe dashboard.')).toBe(
      0
    );
  });
});

describe('isSyntheticAddress', () => {
  it.each([
    ['user@example.com', true],
    ['judge@myk9t.com', true],
    ['e2e-judge@test.myk9.com', true],
    ['someone@acme.test', true],
    ['someone@acme.invalid', true],
    ['real.person@gmail.com', false],
    ['secretary@someclub.org', false],
  ])('%s -> synthetic: %s', (address, expected) => {
    expect(isSyntheticAddress(address)).toBe(expected);
  });
});

describe('scanForBulkPii', () => {
  const read = (files: Record<string, string>) => (file: string) => {
    if (!(file in files)) throw new Error(`no such file: ${file}`);
    return files[file];
  };

  it('flags a file at export scale', () => {
    const files = { 'docs/qa/findings.md': exportOf(BULK_PII_THRESHOLD) };
    const { findings } = scanForBulkPii(Object.keys(files), read(files));

    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe('docs/qa/findings.md');
    expect(findings[0].distinctAddresses).toBe(BULK_PII_THRESHOLD);
  });

  it('leaves a file one address below the threshold alone', () => {
    // The boundary is the whole design: a runbook or a fixture naming a few
    // real contacts is normal, and a guard that fires on it would be turned off.
    const files = { 'docs/operations/runbook.md': exportOf(BULK_PII_THRESHOLD - 1) };
    expect(scanForBulkPii(Object.keys(files), read(files)).findings).toEqual([]);
  });

  it('ignores a grandfathered path', () => {
    const files = { 'docs/mySWT/tbl_History.txt': exportOf(72) };
    expect(scanForBulkPii(Object.keys(files), read(files)).findings).toEqual([]);
  });

  it('still flags a NEW file placed beside a grandfathered one', () => {
    // Grandfathering is for the known export, not a licence to park future
    // exports next to it.
    const files = {
      'docs/mySWT/tbl_History.txt': exportOf(72),
      'docs/imported/2026-new-export.txt': exportOf(30),
    };
    const { findings } = scanForBulkPii(Object.keys(files), read(files));

    expect(findings.map(f => f.file)).toEqual(['docs/imported/2026-new-export.txt']);
  });

  it('reports the worst file first', () => {
    const files = {
      'a.md': exportOf(12),
      'b.md': exportOf(40),
    };
    expect(scanForBulkPii(Object.keys(files), read(files)).findings.map(f => f.file)).toEqual([
      'b.md',
      'a.md',
    ]);
  });

  it('REPORTS an unreadable file instead of silently skipping it', () => {
    // Swallowing this is what hid the quoted-filename bypass: git named the
    // file, the open failed, and the guard called it clean. An unscanned file
    // is not a clean file.
    const scan = scanForBulkPii(['deleted.md'], read({}));

    expect(scan.findings).toEqual([]);
    expect(scan.unreadable).toEqual(['deleted.md']);
  });

  it('does not flag a unit test full of fixture clubs', () => {
    // The real false positive this rule was written for: 33 made-up club
    // addresses in a replication test.
    const files = { 'src/services/__tests__/ReplicatedClubsTable.test.ts': exportOf(33, 'club.com') };
    expect(scanForBulkPii(Object.keys(files), read(files)).findings).toEqual([]);
  });

  it('flags a data fixture inside a test directory', () => {
    const files = { 'src/services/__tests__/fixtures/people.json': exportOf(33, 'gmail.com') };
    expect(scanForBulkPii(Object.keys(files), read(files)).findings.map(f => f.file)).toEqual([
      'src/services/__tests__/fixtures/people.json',
    ]);
  });

  it('skips binaries rather than scanning bytes as text', () => {
    const files = { 'docs/scan.pdf': exportOf(50) };
    expect(scanForBulkPii(Object.keys(files), read(files)).findings).toEqual([]);
  });
});

describe('isScannable', () => {
  it.each(['docs/report.md', 'src/app.ts', 'data/export.csv', 'notes.txt'])('scans %s', file =>
    expect(isScannable(file)).toBe(true)
  );

  it.each([
    'assets/logo.png',
    'docs/form.pdf',
    'pnpm-lock.yaml.lock',
    'node_modules/pkg/index.js',
    'apps/web/dist/bundle.js',
  ])('skips %s', file => expect(isScannable(file)).toBe(false));

  it('exempts its own source, which necessarily contains the patterns it forbids', () => {
    expect(isScannable('scripts/qa/check-bulk-pii.ts')).toBe(false);
  });

  it.each([
    'src/services/__tests__/ReplicatedClubsTable.test.ts',
    'src/pages/Thing.spec.tsx',
  ])('skips the test source file %s, whose addresses are fixtures', file => {
    expect(isScannable(file)).toBe(false);
  });

  it('STILL scans a data fixture inside a test directory', () => {
    // The exemption is the file suffix, not the directory: a real export
    // dropped into __tests__ is exactly the accident worth catching.
    expect(isScannable('src/services/__tests__/fixtures/people.json')).toBe(true);
    expect(isScannable('src/test/fixtures/roster.csv')).toBe(true);
  });
});

describe('grandfathered exemptions', () => {
  it('every grandfathered prefix still exists in the repo', () => {
    // A prefix matching nothing is a standing exemption for code that is gone —
    // the silent-allowlist decay this guard exists to avoid. Run against the
    // real filesystem so a deleted directory actually surfaces here.
    expect(assertGrandfatheredPathsExist(process.cwd())).toEqual([]);
  });

  it('reports a prefix that no longer exists', () => {
    expect(assertGrandfatheredPathsExist('/nonexistent-root', () => false)).toEqual([
      ...GRANDFATHERED_PREFIXES,
    ]);
  });

  it('matches by path prefix', () => {
    expect(isGrandfathered('docs/mySWT/tbl_History.txt')).toBe(true);
    expect(isGrandfathered('docs/qa/findings.md')).toBe(false);
  });
});


/**
 * Both regressions below were real bypasses in the first version of this guard,
 * found by review after it had already merged. They are exercised against a
 * REAL throwaway git repository rather than a mock, because both bugs lived in
 * how git was invoked — a mocked git would have reproduced neither.
 */
describe('file resolution against a real repository', () => {
  function repoWith(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'bulk-pii-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    git('init', '-q', '.');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    for (const [name, content] of Object.entries(files)) {
      const target = join(root, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    git('add', '.');
    git('commit', '-qm', 'initial');
    return root;
  }

  it('reads a non-ASCII filename git would otherwise quote', () => {
    // Without `-z`, git returns "r\303\251sum\303\251.csv" — a name that
    // cannot be opened, so the read failed and the file reported clean. A
    // tracked résumé.csv holding 12 addresses was a complete bypass.
    const root = repoWith({ 'résumé.csv': 'a@gmail.com\n' });

    expect(resolveFilesToScan(root, true, {})).toContain('résumé.csv');
  });

  it('scans everything on a push run whose base equals HEAD', () => {
    // THE bug this guard could least afford. On a push to main the workflow
    // checks out main itself, so origin/main === HEAD, the merge base equals
    // HEAD, and the diff is empty — every direct-to-main commit passed without
    // scanning a single file.
    const root = repoWith({ 'docs/note.md': 'hello' });
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: root });

    expect(resolveDiffRange(root, {})).toBeNull();
    expect(resolveFilesToScan(root, false, {})).toContain('docs/note.md');
  });

  it('uses the push event base when one is supplied', () => {
    const root = repoWith({ 'a.md': 'one' });
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const before = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'b.md'), 'two');
    git('add', '.');
    git('commit', '-qm', 'second');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    const files = resolveFilesToScan(root, false, { GITHUB_EVENT_BEFORE: before });

    expect(files).toEqual(['b.md']);
  });

  it('ignores a push base that is absent, null, or equal to HEAD', () => {
    const root = repoWith({ 'a.md': 'one' });
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: root });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

    // A force-push can name a commit this clone does not have; a branch's first
    // push sends the null SHA. Neither may silently produce an empty scan.
    for (const before of ['0'.repeat(40), 'a'.repeat(40), head]) {
      expect(resolveDiffRange(root, { GITHUB_EVENT_BEFORE: before })).toBeNull();
      expect(resolveFilesToScan(root, false, { GITHUB_EVENT_BEFORE: before })).toContain('a.md');
    }
  });
});
