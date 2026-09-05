import { describe, expect, it } from 'vitest';
import {
  BULK_PII_THRESHOLD,
  GRANDFATHERED_PREFIXES,
  assertGrandfatheredPathsExist,
  countDistinctRealAddresses,
  isGrandfathered,
  isScannable,
  isSyntheticAddress,
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
    const findings = scanForBulkPii(Object.keys(files), read(files));

    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe('docs/qa/findings.md');
    expect(findings[0].distinctAddresses).toBe(BULK_PII_THRESHOLD);
  });

  it('leaves a file one address below the threshold alone', () => {
    // The boundary is the whole design: a runbook or a fixture naming a few
    // real contacts is normal, and a guard that fires on it would be turned off.
    const files = { 'docs/operations/runbook.md': exportOf(BULK_PII_THRESHOLD - 1) };
    expect(scanForBulkPii(Object.keys(files), read(files))).toEqual([]);
  });

  it('ignores a grandfathered path', () => {
    const files = { 'docs/mySWT/tbl_History.txt': exportOf(72) };
    expect(scanForBulkPii(Object.keys(files), read(files))).toEqual([]);
  });

  it('still flags a NEW file placed beside a grandfathered one', () => {
    // Grandfathering is for the known export, not a licence to park future
    // exports next to it.
    const files = {
      'docs/mySWT/tbl_History.txt': exportOf(72),
      'docs/imported/2026-new-export.txt': exportOf(30),
    };
    const findings = scanForBulkPii(Object.keys(files), read(files));

    expect(findings.map(f => f.file)).toEqual(['docs/imported/2026-new-export.txt']);
  });

  it('reports the worst file first', () => {
    const files = {
      'a.md': exportOf(12),
      'b.md': exportOf(40),
    };
    expect(scanForBulkPii(Object.keys(files), read(files)).map(f => f.file)).toEqual([
      'b.md',
      'a.md',
    ]);
  });

  it('does not fail the run on an unreadable file', () => {
    // A path can vanish between `git diff` and the read; that is not a finding.
    expect(scanForBulkPii(['deleted.md'], read({}))).toEqual([]);
  });

  it('does not flag a unit test full of fixture clubs', () => {
    // The real false positive this rule was written for: 33 made-up club
    // addresses in a replication test.
    const files = { 'src/services/__tests__/ReplicatedClubsTable.test.ts': exportOf(33, 'club.com') };
    expect(scanForBulkPii(Object.keys(files), read(files))).toEqual([]);
  });

  it('flags a data fixture inside a test directory', () => {
    const files = { 'src/services/__tests__/fixtures/people.json': exportOf(33, 'gmail.com') };
    expect(scanForBulkPii(Object.keys(files), read(files)).map(f => f.file)).toEqual([
      'src/services/__tests__/fixtures/people.json',
    ]);
  });

  it('skips binaries rather than scanning bytes as text', () => {
    const files = { 'docs/scan.pdf': exportOf(50) };
    expect(scanForBulkPii(Object.keys(files), read(files))).toEqual([]);
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
