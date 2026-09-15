import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  dedupeCandidates,
  deferralCandidatesForPr,
  extractDeferredIds,
  formatTable,
  isOpenDeferral,
  parseSinceFlag,
  reconcile,
  summaryMarkdown,
  type DeferralRow,
  type MergedPr,
  type ReconcileDeps,
} from './deferred-reviews';
import type { GateComment } from './review-gate';

function overrideComment(
  head: string,
  deferredId: string,
  createdAt = '2026-09-10T00:00:00Z',
  authorAssociation = 'OWNER'
): GateComment {
  return {
    body: [
      `Review gate: owner reviewed abc1234..${head} — override, floor was independent`,
      'Override reason: Codex unavailable — usage limit',
      `Deferred re-review: ${deferredId}`,
    ].join('\n'),
    createdAt,
    updatedAt: createdAt,
    author: 'rbeezley',
    authorAssociation,
  };
}

function fakeDeps(overrides: Partial<ReconcileDeps> = {}): ReconcileDeps {
  return {
    listMergedPrs: () => [
      { number: 2246, headRefOid: 'aaaaaaaaaa1111111111', mergedAt: '2026-09-10T00:00:00Z' },
    ],
    commentsForPr: () => [overrideComment('aaaaaaaaa', 'MYK9-509')],
    resolveLinearIssue: async () => ({ exists: true, stateName: 'Done', stateType: 'completed' }),
    now: new Date('2026-09-15T00:00:00Z'),
    ...overrides,
  };
}

describe('extractDeferredIds', () => {
  it('captures the id from a single Deferred re-review line', () => {
    expect(extractDeferredIds('Deferred re-review: MYK9-509')).toEqual(['MYK9-509']);
  });

  it('captures every id when a body somehow names more than one', () => {
    const body = ['Deferred re-review: MYK9-509', 'Deferred re-review: MYK9-522'].join('\n');
    expect(extractDeferredIds(body)).toEqual(['MYK9-509', 'MYK9-522']);
  });

  it('finds nothing in a body with no deferred-review line', () => {
    expect(extractDeferredIds('Review gate: codex reviewed a..b — no findings')).toEqual([]);
  });

  it('is case-sensitive on the prefix, matching the canonical DEFERRED_REVIEW shape', () => {
    expect(extractDeferredIds('Deferred re-review: myk9-509')).toEqual([]);
  });
});

describe('deferralCandidatesForPr', () => {
  const pr: MergedPr = { number: 2246, headRefOid: '123456789abcdef', mergedAt: '2026-09-10' };

  it('extracts a deferred id from an accepted owner override', () => {
    const rows = deferralCandidatesForPr(pr, [overrideComment('123456789', 'MYK9-509')]);
    expect(rows).toEqual([{ pr: 2246, head: '123456789', id: 'MYK9-509' }]);
  });

  it('ignores a comment from an untrusted author association', () => {
    const rows = deferralCandidatesForPr(pr, [overrideComment('123456789', 'MYK9-509', undefined, 'NONE')]);
    expect(rows).toEqual([]);
  });

  it('ignores a comment missing the Override reason line', () => {
    const comment: GateComment = {
      body: [
        'Review gate: owner reviewed abc1234..123456789 — override, floor was independent',
        'Deferred re-review: MYK9-509',
      ].join('\n'),
      createdAt: '2026-09-10T00:00:00Z',
      authorAssociation: 'OWNER',
    };
    expect(deferralCandidatesForPr(pr, [comment])).toEqual([]);
  });

  it('ignores an ordinary codex review comment (not an owner override at all)', () => {
    const comment: GateComment = {
      body: 'Review gate: codex reviewed abc1234..123456789 — no findings',
      createdAt: '2026-09-10T00:00:00Z',
      authorAssociation: 'OWNER',
    };
    expect(deferralCandidatesForPr(pr, [comment])).toEqual([]);
  });
});

describe('dedupeCandidates', () => {
  it('collapses the same (pr, id) pair', () => {
    const candidates = [
      { pr: 1, head: 'aaa', id: 'MYK9-1' },
      { pr: 1, head: 'bbb', id: 'MYK9-1' },
      { pr: 2, head: 'aaa', id: 'MYK9-1' },
    ];
    expect(dedupeCandidates(candidates)).toEqual([
      { pr: 1, head: 'aaa', id: 'MYK9-1' },
      { pr: 2, head: 'aaa', id: 'MYK9-1' },
    ]);
  });
});

describe('parseSinceFlag', () => {
  const now = new Date('2026-09-15T00:00:00Z');

  it('defaults to 30 days before now', () => {
    expect(parseSinceFlag([], now)).toBe('2026-08-16');
  });

  it('honours an explicit --since', () => {
    expect(parseSinceFlag(['--since', '2026-01-01'], now)).toBe('2026-01-01');
  });
});

describe('isOpenDeferral', () => {
  it('is false for an unresolvable id', () => {
    expect(isOpenDeferral({ exists: false, stateType: null })).toBe(false);
  });

  it('is false once the issue is Done (completed)', () => {
    expect(isOpenDeferral({ exists: true, stateType: 'completed' })).toBe(false);
  });

  it('is false once the issue is Canceled', () => {
    expect(isOpenDeferral({ exists: true, stateType: 'canceled' })).toBe(false);
  });

  it('is true for any other resolved state', () => {
    expect(isOpenDeferral({ exists: true, stateType: 'started' })).toBe(true);
    expect(isOpenDeferral({ exists: true, stateType: 'unstarted' })).toBe(true);
    expect(isOpenDeferral({ exists: true, stateType: 'backlog' })).toBe(true);
  });
});

describe('formatTable / summaryMarkdown', () => {
  const rows: DeferralRow[] = [
    { pr: 2246, head: 'aaaaaaaaa', id: 'MYK9-509', exists: true, stateName: 'Done', stateType: 'completed' },
    { pr: 2250, head: 'bbbbbbbbb', id: 'MYK9-522', exists: true, stateName: 'In Progress', stateType: 'started' },
    { pr: 2256, head: 'ccccccccc', id: 'MYK9-999999', exists: false, stateName: null, stateType: null },
  ];

  it('formats every row into the table', () => {
    const table = formatTable(rows);
    expect(table).toContain('MYK9-509');
    expect(table).toContain('MYK9-522');
    expect(table).toContain('MYK9-999999');
    expect(table).toContain('NO');
  });

  it('reports no rows plainly', () => {
    expect(formatTable([])).toContain('no deferred re-reviews');
  });

  it('summary lists only OPEN deferrals, excluding Done and unresolved', () => {
    const summary = summaryMarkdown(rows);
    expect(summary).toContain('MYK9-522');
    expect(summary).not.toContain('MYK9-509');
    expect(summary).not.toContain('MYK9-999999');
  });

  it('summary says so plainly when nothing is open', () => {
    const summary = summaryMarkdown([rows[0]!]);
    expect(summary).toContain('None');
  });
});

describe('reconcile', () => {
  it('fails loudly (exit 2) when REPO is missing', async () => {
    const result = await reconcile({}, [], fakeDeps());
    expect(result.code).toBe(2);
    expect(result.output).toContain('REPO');
  });

  it('fails loudly (exit 2) when LINEAR_API_KEY is missing — never a silent pass on outage', async () => {
    const result = await reconcile({ REPO: 'rbeezley/myk9-platform' }, [], fakeDeps());
    expect(result.code).toBe(2);
    expect(result.output).toContain('LINEAR_API_KEY');
  });

  it('fails loudly (exit 2) when gh cannot list merged PRs', async () => {
    const result = await reconcile(
      { REPO: 'rbeezley/myk9-platform', LINEAR_API_KEY: 'key' },
      [],
      fakeDeps({
        listMergedPrs: () => {
          throw new Error('gh: rate limited');
        },
      })
    );
    expect(result.code).toBe(2);
    expect(result.output).toContain('rate limited');
  });

  it('fails loudly (exit 2) when gh cannot read a PR\'s comments', async () => {
    const result = await reconcile(
      { REPO: 'rbeezley/myk9-platform', LINEAR_API_KEY: 'key' },
      [],
      fakeDeps({
        commentsForPr: () => {
          throw new Error('gh: 404');
        },
      })
    );
    expect(result.code).toBe(2);
    expect(result.output).toContain('#2246');
  });

  it('fails loudly (exit 2) when the Linear API is unreachable — GATE DID NOT RUN, not a silent pass', async () => {
    const result = await reconcile(
      { REPO: 'rbeezley/myk9-platform', LINEAR_API_KEY: 'key' },
      [],
      fakeDeps({
        resolveLinearIssue: async () => {
          throw new Error('fetch failed: ECONNREFUSED');
        },
      })
    );
    expect(result.code).toBe(2);
    expect(result.output).toContain('MYK9-509');
  });

  // Assertion-first for the value-sensitive claim this whole script exists to
  // make: a deferred id that does not resolve must be a red exit code, not a
  // green one that looks identical to a clean reconciliation.
  it('exits 1 when a deferred id does not resolve, naming the id and PR', async () => {
    const result = await reconcile(
      { REPO: 'rbeezley/myk9-platform', LINEAR_API_KEY: 'key' },
      [],
      fakeDeps({
        resolveLinearIssue: async () => ({ exists: false, stateName: null, stateType: null }),
      })
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain('MYK9-509');
    expect(result.output).toContain('#2246');
    expect(result.output).toContain('unresolvable');
  });

  it('exits 0 when every deferred id resolves (open or closed)', async () => {
    const result = await reconcile({ REPO: 'rbeezley/myk9-platform', LINEAR_API_KEY: 'key' }, [], fakeDeps());
    expect(result.code).toBe(0);
  });

  it('dedupes the same (PR, id) pair posted twice, calling Linear once', async () => {
    let calls = 0;
    const result = await reconcile(
      { REPO: 'rbeezley/myk9-platform', LINEAR_API_KEY: 'key' },
      [],
      fakeDeps({
        commentsForPr: () => [
          overrideComment('aaaaaaaaa', 'MYK9-509', '2026-09-01T00:00:00Z'),
          overrideComment('aaaaaaaaa', 'MYK9-509', '2026-09-05T00:00:00Z'),
        ],
        resolveLinearIssue: async () => {
          calls++;
          return { exists: true, stateName: 'Done', stateType: 'completed' };
        },
      })
    );
    expect(result.code).toBe(0);
    expect(calls).toBe(1);
  });

  it('writes the open-deferral list to GITHUB_STEP_SUMMARY, excluding Done issues', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'deferred-reviews-summary-'));
    const summaryFile = join(dir, 'summary.md');
    writeFileSync(summaryFile, '');
    try {
      const result = await reconcile(
        {
          REPO: 'rbeezley/myk9-platform',
          LINEAR_API_KEY: 'key',
          GITHUB_STEP_SUMMARY: summaryFile,
        },
        [],
        fakeDeps({
          listMergedPrs: () => [
            { number: 2246, headRefOid: 'aaaaaaaaaa11', mergedAt: '2026-09-10' },
            { number: 2250, headRefOid: 'bbbbbbbbbb22', mergedAt: '2026-09-11' },
          ],
          commentsForPr: (_repo, number) =>
            number === 2246
              ? [overrideComment('aaaaaaaaa', 'MYK9-509')]
              : [overrideComment('bbbbbbbbb', 'MYK9-522')],
          resolveLinearIssue: async id =>
            id === 'MYK9-509'
              ? { exists: true, stateName: 'Done', stateType: 'completed' }
              : { exists: true, stateName: 'In Progress', stateType: 'started' },
        })
      );
      expect(result.code).toBe(0);
      const summary = readFileSync(summaryFile, 'utf8');
      expect(summary).toContain('MYK9-522');
      expect(summary).not.toContain('MYK9-509');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('deferred-reviews --self-test (offline, no gh/Linear calls)', () => {
  const scriptPath = resolve(import.meta.dirname, 'deferred-reviews.ts');
  const source = readFileSync(scriptPath, 'utf8');
  // The one branch this whole script exists to add: a deferred id that does
  // not resolve must fail the exit code. A mutant lives NEXT TO review-gate.ts
  // so its relative import resolves exactly as the real file's does.
  const anchor = 'return { code: unresolved.length > 0 ? 1 : 0, rows, output };';

  function runSelfTest(scriptText: string) {
    const mutantPath = join(
      import.meta.dirname,
      `.deferred-reviews.selftest-${process.pid}-${Date.now()}.ts`
    );
    writeFileSync(mutantPath, scriptText);
    try {
      return spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
          mutantPath,
          '--self-test',
        ],
        { encoding: 'utf8' }
      );
    } finally {
      rmSync(mutantPath, { force: true });
    }
  }

  it('passes its own self-test on the real source', () => {
    const result = runSelfTest(source);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('self-test PASS');
  });

  // The point of a self-test is that it catches THE bug it exists to catch.
  // If a mutant that removes the fail-closed branch still passes, the
  // self-test is decoration (LESSONS #mutation-actually-mutated).
  it('a mutant that always reports success on an unresolvable id fails the self-test', () => {
    expect(source.includes(anchor), 'mutation anchor not found — the mutant would not have landed').toBe(
      true
    );
    const mutated = source.replace(anchor, 'return { code: 0, rows, output };');
    expect(mutated).not.toEqual(source);
    const result = runSelfTest(mutated);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('FAIL');
  });
});
