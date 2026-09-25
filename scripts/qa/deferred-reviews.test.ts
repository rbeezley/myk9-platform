import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  candidateIssueNumbers,
  COMMENT_PAGE_CAP,
  dedupeCandidates,
  deferralCandidatesForPr,
  errorIsNotFound,
  extractDeferredIds,
  formatTable,
  groupCommentsByIssue,
  isDroppedDeferral,
  isOpenDeferral,
  parseRepoComments,
  parseSinceFlag,
  prIsMerged,
  reconcile,
  resolveLinearIssue,
  summaryMarkdown,
  type DeferralRow,
  type PrView,
  type ReconcileDeps,
  type RepoComment,
} from './deferred-reviews';

const HEAD = 'aaaaaaaaa1111111111122222222223333333333';

function mergedPr(number = 2246, headRefOid = HEAD): PrView {
  return {
    number,
    state: 'MERGED',
    mergedAt: '2026-09-10T00:00:00Z',
    mergeCommit: { oid: 'ffffffffff' },
    headRefOid,
  };
}

function overrideComment(
  issue: number,
  head: string,
  deferredId: string,
  updatedAt = '2026-09-10T00:00:00Z',
  authorAssociation = 'OWNER'
): RepoComment {
  return {
    issue,
    body: [
      `Review gate: owner reviewed abc1234..${head} — override, floor was independent`,
      'Override reason: Codex unavailable — usage limit',
      `Deferred re-review: ${deferredId}`,
    ].join('\n'),
    createdAt: updatedAt,
    updatedAt,
    author: 'rbeezley',
    authorAssociation,
  };
}

function fakeDeps(overrides: Partial<ReconcileDeps> = {}): ReconcileDeps {
  return {
    listRepoComments: () => [overrideComment(2246, 'aaaaaaaaa', 'MYK9-509')],
    viewPr: (_repo, number) => mergedPr(number),
    resolveLinearIssue: async () => ({ exists: true, stateName: 'Done', stateType: 'completed' }),
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

describe('groupCommentsByIssue / candidateIssueNumbers', () => {
  const comments: RepoComment[] = [
    overrideComment(2246, 'aaaaaaaaa', 'MYK9-509'),
    { ...overrideComment(2246, 'aaaaaaaaa', 'MYK9-509'), body: 'a plain reply' },
    { ...overrideComment(2250, 'bbbbbbbbb', 'MYK9-522'), body: 'lgtm' },
    overrideComment(2256, 'ccccccccc', 'MYK9-531'),
  ];

  it('buckets comments by issue number, preserving order', () => {
    const grouped = groupCommentsByIssue(comments);
    expect([...grouped.keys()]).toEqual([2246, 2250, 2256]);
    expect(grouped.get(2246)).toHaveLength(2);
  });

  it('only issues naming a deferred id are worth a gh pr view', () => {
    expect(candidateIssueNumbers(groupCommentsByIssue(comments))).toEqual([2246, 2256]);
  });

  it('returns nothing when no comment in the window names a deferral', () => {
    const chatter: RepoComment[] = [{ ...overrideComment(1, 'a', 'MYK9-1'), body: 'ship it' }];
    expect(candidateIssueNumbers(groupCommentsByIssue(chatter))).toEqual([]);
  });
});

describe('prIsMerged', () => {
  it('is true only for a merged pull request', () => {
    expect(prIsMerged(mergedPr())).toBe(true);
    expect(prIsMerged({ ...mergedPr(), state: 'OPEN', mergedAt: null })).toBe(false);
    expect(prIsMerged({ ...mergedPr(), state: 'CLOSED', mergedAt: null })).toBe(false);
    expect(prIsMerged({ ...mergedPr(), mergedAt: null })).toBe(false);
  });
});

describe('deferralCandidatesForPr', () => {
  const pr = mergedPr(2246);

  it('extracts a deferred id from an accepted owner override for the merged head', () => {
    const rows = deferralCandidatesForPr(pr, [overrideComment(2246, 'aaaaaaaaa', 'MYK9-509')]);
    expect(rows).toEqual([{ pr: 2246, head: 'aaaaaaaaa', id: 'MYK9-509' }]);
  });

  it('ignores a comment from an untrusted author association', () => {
    const rows = deferralCandidatesForPr(pr, [
      overrideComment(2246, 'aaaaaaaaa', 'MYK9-509', undefined, 'NONE'),
    ]);
    expect(rows).toEqual([]);
  });

  it('ignores a comment missing the Override reason line', () => {
    const comment: RepoComment = {
      issue: 2246,
      body: [
        'Review gate: owner reviewed abc1234..aaaaaaaaa — override, floor was independent',
        'Deferred re-review: MYK9-509',
      ].join('\n'),
      createdAt: '2026-09-10T00:00:00Z',
      updatedAt: '2026-09-10T00:00:00Z',
      authorAssociation: 'OWNER',
    };
    expect(deferralCandidatesForPr(pr, [comment])).toEqual([]);
  });

  it('ignores an ordinary codex review comment (not an owner override at all)', () => {
    const comment: RepoComment = {
      issue: 2246,
      body: 'Review gate: codex reviewed abc1234..aaaaaaaaa — no findings',
      createdAt: '2026-09-10T00:00:00Z',
      updatedAt: '2026-09-10T00:00:00Z',
      authorAssociation: 'OWNER',
    };
    expect(deferralCandidatesForPr(pr, [comment])).toEqual([]);
  });

  it('ignores an override recorded for a head that is not the merged one', () => {
    const rows = deferralCandidatesForPr(pr, [overrideComment(2246, 'dddddddd1', 'MYK9-509')]);
    expect(rows).toEqual([]);
  });

  // P2-2: the gate only ever honoured ONE line — the latest for the merged
  // head. A typo'd id corrected minutes later was never the thing that gated
  // the merge, so reconciling it would invent permanent, unclearable debt.
  it('a corrected override supersedes the typo it replaced on the same head', () => {
    const rows = deferralCandidatesForPr(pr, [
      overrideComment(2246, 'aaaaaaaaa', 'MYK9-5099', '2026-09-10T00:00:00Z'),
      overrideComment(2246, 'aaaaaaaaa', 'MYK9-509', '2026-09-10T00:05:00Z'),
    ]);
    expect(rows.map(row => row.id)).toEqual(['MYK9-509']);
  });

  it('orders by updatedAt, so an edited older comment outranks a newer created one', () => {
    const edited = overrideComment(2246, 'aaaaaaaaa', 'MYK9-600', '2026-09-10T00:00:00Z');
    edited.updatedAt = '2026-09-12T00:00:00Z';
    const rows = deferralCandidatesForPr(pr, [
      edited,
      overrideComment(2246, 'aaaaaaaaa', 'MYK9-601', '2026-09-11T00:00:00Z'),
    ]);
    expect(rows.map(row => row.id)).toEqual(['MYK9-600']);
  });

  it('a later clean codex review for the same head clears the deferral entirely', () => {
    const rows = deferralCandidatesForPr(pr, [
      overrideComment(2246, 'aaaaaaaaa', 'MYK9-509', '2026-09-10T00:00:00Z'),
      {
        issue: 2246,
        body: 'Review gate: codex reviewed abc1234..aaaaaaaaa — no findings',
        createdAt: '2026-09-11T00:00:00Z',
        updatedAt: '2026-09-11T00:00:00Z',
        authorAssociation: 'OWNER',
      },
    ]);
    expect(rows).toEqual([]);
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

// The default window is pinned in deferred-reviews.window.test.ts (MYK9-748).
describe('parseSinceFlag', () => {
  it('honours an explicit --since', () => {
    expect(parseSinceFlag(['--since', '2026-01-01'])).toBe('2026-01-01');
  });
});

describe('parseRepoComments', () => {
  const page = (issue: number) => [
    {
      body: 'hello',
      created_at: '2026-09-10T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
      author_association: 'OWNER',
      user: { login: 'rbeezley' },
      issue_url: `https://api.github.com/repos/rbeezley/myk9-platform/issues/${issue}`,
    },
  ];

  it('flattens pages and recovers the issue number from issue_url', () => {
    const rows = parseRepoComments(JSON.stringify([page(2246), page(2250)]));
    expect(rows.map(row => row.issue)).toEqual([2246, 2250]);
    expect(rows[0]?.author).toBe('rbeezley');
    expect(rows[0]?.authorAssociation).toBe('OWNER');
  });

  // Sanity cap: a capped listing cannot be distinguished from a complete one,
  // so hitting it is a FAILURE, never a shortened result.
  it('throws when the page count reaches the sanity cap', () => {
    const pages = Array.from({ length: COMMENT_PAGE_CAP }, () => []);
    expect(() => parseRepoComments(JSON.stringify(pages))).toThrow(/sanity cap/);
  });

  it('does not throw one page below the cap', () => {
    const pages = Array.from({ length: COMMENT_PAGE_CAP - 1 }, () => []);
    expect(parseRepoComments(JSON.stringify(pages))).toEqual([]);
  });
});

describe('errorIsNotFound / resolveLinearIssue', () => {
  it('recognises a not-found entity from extensions.type or extensions.code', () => {
    expect(errorIsNotFound([{ extensions: { type: 'Entity not found' } }])).toBe(true);
    expect(errorIsNotFound([{ extensions: { code: 'ENTITY_NOT_FOUND' } }])).toBe(true);
  });

  it('does not treat an auth or rate-limit error as not-found', () => {
    expect(errorIsNotFound([{ extensions: { type: 'authentication error' } }])).toBe(false);
    expect(errorIsNotFound([{ extensions: { type: 'ratelimited' } }])).toBe(false);
    expect(errorIsNotFound([{ message: 'boom' }])).toBe(false);
  });

  it('is false when only SOME errors are not-found', () => {
    expect(
      errorIsNotFound([
        { extensions: { code: 'ENTITY_NOT_FOUND' } },
        { extensions: { type: 'internal error' } },
      ])
    ).toBe(false);
  });

  function fakeFetch(payload: unknown, ok = true, status = 200) {
    return (async () =>
      ({
        ok,
        status,
        json: async () => payload,
      }) as unknown as Response) as unknown as typeof fetch;
  }

  it('reports a not-found id as exists:false', async () => {
    const lookup = await resolveLinearIssue(
      'MYK9-999999',
      'key',
      fakeFetch({ errors: [{ message: 'Entity not found', extensions: { type: 'not found' } }] })
    );
    expect(lookup).toEqual({ exists: false, stateName: null, stateType: null });
  });

  // P3: an outage read as exists:false would report the whole ledger as broken
  // during a Linear incident. It must be GATE DID NOT RUN (exit 2) instead.
  it('throws on a GraphQL error that is not a not-found entity', async () => {
    await expect(
      resolveLinearIssue(
        'MYK9-509',
        'key',
        fakeFetch({
          errors: [{ message: 'Authentication required', extensions: { type: 'authentication' } }],
        })
      )
    ).rejects.toThrow(/Authentication required/);
  });

  it('throws on a non-OK HTTP response', async () => {
    await expect(resolveLinearIssue('MYK9-509', 'key', fakeFetch({}, false, 503))).rejects.toThrow(
      /HTTP 503/
    );
  });

  it('returns the state of a resolved issue', async () => {
    const lookup = await resolveLinearIssue(
      'MYK9-509',
      'key',
      fakeFetch({
        data: { issue: { identifier: 'MYK9-509', state: { name: 'Done', type: 'completed' } } },
      })
    );
    expect(lookup).toEqual({ exists: true, stateName: 'Done', stateType: 'completed' });
  });
});

describe('isOpenDeferral / isDroppedDeferral', () => {
  it('an unresolvable id is neither open nor dropped — it is its own failure', () => {
    expect(isOpenDeferral({ exists: false, stateType: null })).toBe(false);
    expect(isDroppedDeferral({ exists: false, stateType: null })).toBe(false);
  });

  it('completed clears the debt', () => {
    expect(isOpenDeferral({ exists: true, stateType: 'completed' })).toBe(false);
    expect(isDroppedDeferral({ exists: true, stateType: 'completed' })).toBe(false);
  });

  // P2-3: canceled means the re-review was DROPPED, not done.
  it('canceled is dropped, not open, and never counts as cleared', () => {
    expect(isOpenDeferral({ exists: true, stateType: 'canceled' })).toBe(false);
    expect(isDroppedDeferral({ exists: true, stateType: 'canceled' })).toBe(true);
  });

  it('every other resolved state is still open', () => {
    for (const stateType of ['started', 'unstarted', 'backlog', 'triage']) {
      expect(isOpenDeferral({ exists: true, stateType })).toBe(true);
      expect(isDroppedDeferral({ exists: true, stateType })).toBe(false);
    }
  });
});

describe('formatTable / summaryMarkdown', () => {
  const rows: DeferralRow[] = [
    {
      pr: 2246,
      head: 'aaaaaaaaa',
      id: 'MYK9-509',
      exists: true,
      stateName: 'Done',
      stateType: 'completed',
    },
    {
      pr: 2250,
      head: 'bbbbbbbbb',
      id: 'MYK9-522',
      exists: true,
      stateName: 'In Progress',
      stateType: 'started',
    },
    {
      pr: 2256,
      head: 'ccccccccc',
      id: 'MYK9-999999',
      exists: false,
      stateName: null,
      stateType: null,
    },
    {
      pr: 2258,
      head: 'ddddddddd',
      id: 'MYK9-540',
      exists: true,
      stateName: 'Canceled',
      stateType: 'canceled',
    },
  ];

  it('formats every row into the table', () => {
    const table = formatTable(rows);
    expect(table).toContain('MYK9-509');
    expect(table).toContain('MYK9-522');
    expect(table).toContain('MYK9-999999');
    expect(table).toContain('MYK9-540');
    expect(table).toContain('NO');
  });

  it('reports no rows plainly', () => {
    expect(formatTable([])).toContain('no deferred re-reviews');
  });

  it('summary lists only OPEN deferrals under the open heading', () => {
    const open = summaryMarkdown(rows).split('## Dropped deferrals')[0]!;
    expect(open).toContain('MYK9-522');
    expect(open).not.toContain('MYK9-509');
    expect(open).not.toContain('MYK9-999999');
    expect(open).not.toContain('MYK9-540');
  });

  it('summary gives canceled deferrals their own dropped section', () => {
    const dropped = summaryMarkdown(rows).split('## Dropped deferrals')[1]!;
    expect(dropped).toContain('MYK9-540');
    expect(dropped).not.toContain('MYK9-522');
  });

  it('summary says so plainly when nothing is open and nothing was dropped', () => {
    const summary = summaryMarkdown([rows[0]!]);
    expect(summary).toContain('None —');
    expect(summary).toContain('None.');
  });
});

describe('reconcile', () => {
  const env = { REPO: 'rbeezley/myk9-platform', LINEAR_API_KEY: 'key' };

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

  it('fails loudly (exit 2) when the repo comment listing fails or is truncation-suspect', async () => {
    const result = await reconcile(
      env,
      [],
      fakeDeps({
        listRepoComments: () => {
          throw new Error('reached the sanity cap');
        },
      })
    );
    expect(result.code).toBe(2);
    expect(result.output).toContain('sanity cap');
  });

  it('fails loudly (exit 2) when gh cannot read a candidate PR', async () => {
    const result = await reconcile(
      env,
      [],
      fakeDeps({
        viewPr: () => {
          throw new Error('gh: 404');
        },
      })
    );
    expect(result.code).toBe(2);
    expect(result.output).toContain('#2246');
  });

  it('fails loudly (exit 2) when the Linear API is unreachable — GATE DID NOT RUN, not a silent pass', async () => {
    const result = await reconcile(
      env,
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
      env,
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

  // P2-3: a canceled follow-up is scrutiny that never happened. The ledger
  // must not read as satisfied.
  it('exits 1 when a deferred id resolves to a CANCELED issue, naming it as dropped', async () => {
    const result = await reconcile(
      env,
      [],
      fakeDeps({
        resolveLinearIssue: async () => ({
          exists: true,
          stateName: 'Canceled',
          stateType: 'canceled',
        }),
      })
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain('dropped deferral');
    expect(result.output).toContain('MYK9-509');
  });

  it('exits 0 when the deferral is completed', async () => {
    const result = await reconcile(env, [], fakeDeps());
    expect(result.code).toBe(0);
  });

  it('exits 0 with the id still listed while the deferral is merely open', async () => {
    const result = await reconcile(
      env,
      [],
      fakeDeps({
        resolveLinearIssue: async () => ({
          exists: true,
          stateName: 'In Progress',
          stateType: 'started',
        }),
      })
    );
    expect(result.code).toBe(0);
    expect(result.output).toContain('MYK9-509');
  });

  it('reports how much was scanned, so a silently empty window is visible', async () => {
    const result = await reconcile(env, [], fakeDeps());
    expect(result.output).toContain('scanned 1 comment(s) across 1 issue(s)');
    expect(result.output).toContain('1 named a deferred id, 1 of those are merged PRs');
  });

  it('skips an issue that is not a merged PR, spending no Linear lookup on it', async () => {
    let calls = 0;
    const result = await reconcile(
      env,
      [],
      fakeDeps({
        viewPr: (_repo, number) => ({ ...mergedPr(number), state: 'OPEN', mergedAt: null }),
        resolveLinearIssue: async () => {
          calls++;
          return { exists: true, stateName: 'Done', stateType: 'completed' };
        },
      })
    );
    expect(result.code).toBe(0);
    expect(calls).toBe(0);
    expect(result.output).toContain('0 of those are merged PRs');
  });

  it('spends one PR lookup per candidate, not one per issue in the window', async () => {
    const viewed: number[] = [];
    await reconcile(
      env,
      [],
      fakeDeps({
        listRepoComments: () => [
          overrideComment(2246, 'aaaaaaaaa', 'MYK9-509'),
          { ...overrideComment(2250, 'bbbbbbbbb', 'MYK9-522'), body: 'lgtm' },
          { ...overrideComment(2256, 'ccccccccc', 'MYK9-531'), body: 'nice' },
        ],
        viewPr: (_repo, number) => {
          viewed.push(number);
          return mergedPr(number);
        },
      })
    );
    expect(viewed).toEqual([2246]);
  });

  it('dedupes an override line naming the same id twice, calling Linear once', async () => {
    let calls = 0;
    const doubled = overrideComment(2246, 'aaaaaaaaa', 'MYK9-509');
    doubled.body += '\nDeferred re-review: MYK9-509';
    const result = await reconcile(
      env,
      [],
      fakeDeps({
        listRepoComments: () => [doubled],
        resolveLinearIssue: async () => {
          calls++;
          return { exists: true, stateName: 'Done', stateType: 'completed' };
        },
      })
    );
    expect(result.code).toBe(0);
    expect(calls).toBe(1);
  });

  it('writes both summary sections to GITHUB_STEP_SUMMARY', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'deferred-reviews-summary-'));
    const summaryFile = join(dir, 'summary.md');
    writeFileSync(summaryFile, '');
    try {
      const result = await reconcile(
        { ...env, GITHUB_STEP_SUMMARY: summaryFile },
        [],
        fakeDeps({
          listRepoComments: () => [
            overrideComment(2246, 'aaaaaaaaa', 'MYK9-509'),
            overrideComment(2250, 'bbbbbbbbb', 'MYK9-522'),
            overrideComment(2256, 'ccccccccc', 'MYK9-540'),
          ],
          viewPr: (_repo, number) =>
            mergedPr(
              number,
              number === 2246
                ? HEAD
                : number === 2250
                  ? 'bbbbbbbbb2222222222233333333334444444444'
                  : 'ccccccccc3333333333344444444445555555555'
            ),
          resolveLinearIssue: async id => {
            if (id === 'MYK9-509')
              return { exists: true, stateName: 'Done', stateType: 'completed' };
            if (id === 'MYK9-522')
              return { exists: true, stateName: 'In Progress', stateType: 'started' };
            return { exists: true, stateName: 'Canceled', stateType: 'canceled' };
          },
        })
      );
      expect(result.code).toBe(1);
      const summary = readFileSync(summaryFile, 'utf8');
      const [open, dropped] = summary.split('## Dropped deferrals');
      expect(open).toContain('MYK9-522');
      expect(open).not.toContain('MYK9-509');
      expect(dropped).toContain('MYK9-540');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('deferred-reviews --self-test (offline, no gh/Linear calls)', () => {
  const scriptPath = resolve(import.meta.dirname, 'deferred-reviews.ts');
  const source = readFileSync(scriptPath, 'utf8');

  function runSelfTest(scriptText: string) {
    // A mutant lives NEXT TO review-gate.ts so its relative import resolves
    // exactly as the real file's does.
    const mutantPath = join(
      import.meta.dirname,
      `.deferred-reviews.selftest-${process.pid}-${Math.random().toString(36).slice(2)}.ts`
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

  function mutate(anchor: string, replacement: string) {
    expect(
      source.includes(anchor),
      `mutation anchor not found — the mutant would not have landed: ${anchor}`
    ).toBe(true);
    const mutated = source.replace(anchor, replacement);
    expect(mutated).not.toEqual(source);
    return runSelfTest(mutated);
  }

  it('passes its own self-test on the real source', () => {
    const result = runSelfTest(source);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('self-test PASS');
  });

  // The point of a self-test is that it catches THE bugs it exists to catch.
  // A mutant that still passes means the self-test is decoration
  // (LESSONS #mutation-actually-mutated).
  it('a mutant that always reports success fails the self-test', () => {
    const result = mutate(
      'return { code: unresolved.length > 0 || dropped.length > 0 ? 1 : 0, rows, output };',
      'return { code: 0, rows, output };'
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('FAIL');
  });

  it('a mutant that treats a CANCELED deferral as cleared fails the self-test', () => {
    const result = mutate(
      'return { code: unresolved.length > 0 || dropped.length > 0 ? 1 : 0, rows, output };',
      'return { code: unresolved.length > 0 ? 1 : 0, rows, output };'
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('[a canceled deferral is NOT cleared]: FAIL');
  });

  it('a mutant that drops the page-count sanity cap fails the self-test', () => {
    const result = mutate(
      'if (pages.length >= COMMENT_PAGE_CAP) {',
      'if (pages.length >= Number.MAX_SAFE_INTEGER) {'
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('[a page count at the sanity cap throws]: FAIL');
  });

  it('a mutant that reconciles every override, not just the latest for the head, fails the self-test', () => {
    const result = mutate(
      'const latest = forHead.at(-1);\n  if (!latest || !overrideAccepted(latest)) return [];',
      'const latest = forHead.at(0);\n  if (!latest || !overrideAccepted(latest)) return [];'
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('[only the latest override for the head carries debt]: FAIL');
  });
});
