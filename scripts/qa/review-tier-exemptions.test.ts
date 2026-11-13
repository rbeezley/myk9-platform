import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateReviewGate, runCli } from './review-gate';
import {
  baselineChangeIsLoweringOnly,
  exemptBaselineFiles,
  exemptBaselineFilesViaGh,
  exemptBaselineFilesViaGit,
  RATCHET_BASELINE_ALLOWLIST,
} from './review-tier-exemptions';
import { requiredTier } from './review-tier';

const BASELINE = 'scripts/qa/em-dash-ratchet.baseline.json';
const OTHER_BASELINE = 'scripts/qa/code-quality-ratchet.baseline.json';
const GUARD = '.githooks/pre-push';
const baselineJson = (total: number, files: Record<string, number>, updatedAt = 'x') =>
  JSON.stringify({ version: 1, updatedAt, total, files }, null, 2) + '\n';
const BASE_TEXT = baselineJson(5, { 'a.ts': 3, 'b.ts': 2 });

describe('baselineChangeIsLoweringOnly', () => {
  it.each([
    ['equal counts', BASE_TEXT, true],
    ['lowered count', baselineJson(4, { 'a.ts': 2, 'b.ts': 2 }), true],
    ['removed entry', baselineJson(3, { 'a.ts': 3 }), true],
    ['raised count', baselineJson(5, { 'a.ts': 4, 'b.ts': 2 }), false],
    ['added key', baselineJson(5, { 'a.ts': 3, 'b.ts': 2, 'c.ts': 0 }), false],
    ['changed version', BASE_TEXT.replace('"version": 1', '"version": 0'), false],
    ['not JSON', '{', false],
    ['number replaced by string', BASE_TEXT.replace('"total": 5', '"total": "4"'), false],
  ])('%s', (_name, head, expected) => {
    expect(baselineChangeIsLoweringOnly(BASE_TEXT, head)).toBe(expected);
  });

  it('ignores updatedAt but not other strings', () => {
    expect(
      baselineChangeIsLoweringOnly(BASE_TEXT, baselineJson(5, { 'a.ts': 3, 'b.ts': 2 }, 'z'))
    ).toBe(true);
    expect(baselineChangeIsLoweringOnly('{"mode":"a","n":1}', '{"mode":"b","n":1}')).toBe(false);
  });
});

describe('the baseline allowlist', () => {
  it('names only baseline files that exist and holds no array baseline', () => {
    for (const file of RATCHET_BASELINE_ALLOWLIST) {
      expect(file).toMatch(/^scripts\/qa\/[^/]+\.baseline\.json$/);
    }
    expect(RATCHET_BASELINE_ALLOWLIST.has('scripts/qa/typecheck-scripts.baseline.json')).toBe(
      false
    );
  });

  it('never exempts a baseline that is not on the list', () => {
    const exempt = exemptBaselineFiles(['scripts/qa/new-thing.baseline.json'], () => ({
      base: BASE_TEXT,
      head: baselineJson(1, {}),
    }));
    expect(exempt.size).toBe(0);
  });

  it('fails closed when the reader throws', () => {
    const exempt = exemptBaselineFiles([BASELINE], () => {
      throw new Error('404');
    });
    expect(exempt.size).toBe(0);
  });
});

describe('exemptBaselineFilesViaGit', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function repo(edit: Record<string, string | null>) {
    const dir = mkdtempSync(join(tmpdir(), 'review-tier-'));
    dirs.push(dir);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    const write = (file: string, text: string) => {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), text);
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    git('config', 'commit.gpgsign', 'false');
    write(BASELINE, BASE_TEXT);
    write(GUARD, '#!/bin/sh\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'work');
    for (const [file, text] of Object.entries(edit)) {
      if (text === null) git('rm', '-q', file);
      else write(file, text);
    }
    git('add', '-A');
    git('commit', '-q', '-m', 'work');
    return { dir, files: Object.keys(edit) };
  }

  const tierFor = (edit: Record<string, string | null>) => {
    const { dir, files } = repo(edit);
    return requiredTier(files, exemptBaselineFilesViaGit('main', 'HEAD', files, dir)).tier;
  };

  it('a lowering-only baseline alone falls to the tooling floor', () => {
    expect(tierFor({ [BASELINE]: baselineJson(3, { 'a.ts': 3 }) })).toBe('adversarial');
  });

  it('a raised count stays independent', () => {
    expect(tierFor({ [BASELINE]: baselineJson(6, { 'a.ts': 4, 'b.ts': 2 }) })).toBe('independent');
  });

  it('an added key stays independent', () => {
    expect(tierFor({ [BASELINE]: baselineJson(5, { 'a.ts': 3, 'c.ts': 1 }) })).toBe('independent');
  });

  it('a deleted baseline stays independent', () => {
    expect(tierFor({ [BASELINE]: null })).toBe('independent');
  });

  it('an added baseline stays independent', () => {
    expect(tierFor({ [OTHER_BASELINE]: baselineJson(1, {}) })).toBe('independent');
  });

  it('another guardrail file beside a lowered baseline stays independent', () => {
    expect(
      tierFor({ [BASELINE]: baselineJson(3, { 'a.ts': 3 }), [GUARD]: '#!/bin/sh\nexit 0\n' })
    ).toBe('independent');
  });

  it('fails closed when the base cannot be resolved', () => {
    const { dir, files } = repo({ [BASELINE]: baselineJson(3, { 'a.ts': 3 }) });
    expect(exemptBaselineFilesViaGit('no-such-ref', 'HEAD', files, dir).size).toBe(0);
  });

  it('--files-stdin agrees with the gate when given the SHAs', () => {
    const { dir, files } = repo({ [BASELINE]: baselineJson(3, { 'a.ts': 3 }) });
    const sha = (ref: string) =>
      execFileSync('git', ['rev-parse', ref], { cwd: dir, encoding: 'utf8' }).trim();
    const run = (extra: string[]) =>
      execFileSync(
        'node',
        [
          '--experimental-strip-types',
          '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
          resolve(import.meta.dirname, 'review-tier.ts'),
          '--files-stdin',
          ...extra,
        ],
        { input: files.join('\n') + '\n', encoding: 'utf8', cwd: dir }
      ).trim();
    expect(run(['--base', sha('main'), '--head', sha('work')])).toBe('adversarial');
    expect(run([])).toBe('independent');
  });
});

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const MERGE_BASE = 'c'.repeat(40);
const REPO = 'o/r';

describe('exemptBaselineFilesViaGh', () => {
  function fakeGh(contents: Record<string, string | Error>) {
    const calls: string[][] = [];
    const run = (args: string[]): string => {
      calls.push(args);
      if (args.some(a => a.includes('/compare/'))) return `${MERGE_BASE}\n`;
      const url = args.find(a => a.includes('/contents/')) ?? '';
      const [, path = '', ref = ''] = /contents\/(.+)\?ref=(.+)$/.exec(url) ?? [];
      const value = contents[`${ref}:${path}`];
      if (value === undefined || value instanceof Error) throw value ?? new Error('404');
      return value;
    };
    return { run, calls };
  }
  const input = { changedFiles: [BASELINE], baseSha: BASE, headSha: HEAD };

  it('reads base from the merge base and head from the head SHA, by API', () => {
    const { run, calls } = fakeGh({
      [`${MERGE_BASE}:${BASELINE}`]: BASE_TEXT,
      [`${HEAD}:${BASELINE}`]: baselineJson(3, { 'a.ts': 3 }),
    });
    expect([...exemptBaselineFilesViaGh(run, REPO, input)]).toEqual([BASELINE]);
    expect(calls[0]).toContain(`repos/${REPO}/compare/${BASE}...${HEAD}`);
  });

  it('a fetch failure is not exempt', () => {
    const { run } = fakeGh({ [`${MERGE_BASE}:${BASELINE}`]: BASE_TEXT });
    expect(exemptBaselineFilesViaGh(run, REPO, input).size).toBe(0);
  });

  it('a missing base SHA is not exempt and fetches nothing', () => {
    const { run, calls } = fakeGh({});
    expect(exemptBaselineFilesViaGh(run, REPO, { ...input, baseSha: undefined }).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('fetches nothing when no allowlisted baseline changed', () => {
    const { run, calls } = fakeGh({});
    expect(exemptBaselineFilesViaGh(run, REPO, { ...input, changedFiles: [GUARD] }).size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe('the gate floor with the baseline exemption', () => {
  const evidence = [
    `Review gate: adversarial reviewed abc1234..${HEAD} — 2 lenses, all findings addressed`,
    'Adversarial subagent review: correctness and data flow',
    'Adversarial subagent review: security and failure modes',
  ].join('\n');
  const comments = [
    {
      body: evidence,
      createdAt: '2026-09-05T16:00:00Z',
      author: 'rbeezley',
      authorAssociation: 'OWNER',
    },
  ];
  const exemptFiles = new Set([BASELINE]);

  it('a lowering-only baseline takes adversarial evidence', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments,
      changedFiles: [BASELINE],
      exemptFiles,
    });
    expect(result.state).toBe('success');
  });

  it('the same change without the exemption needs independent', () => {
    const result = evaluateReviewGate({ headSha: HEAD, comments, changedFiles: [BASELINE] });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('independent');
  });

  it('another guardrail file in the same PR still needs independent', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments,
      changedFiles: [BASELINE, GUARD],
      exemptFiles,
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('independent');
  });

  describe('through runCli, with contents fetched by SHA', () => {
    const env = { PR_NUMBER: '1', REPO } as NodeJS.ProcessEnv;
    const fake =
      (files: string[], headText: string) =>
      (args: string[]): string => {
        if (args[0] === 'pr' && args[1] === 'view') {
          return JSON.stringify({
            headRefOid: HEAD,
            baseRefOid: BASE,
            isDraft: false,
            changedFiles: files.length,
          });
        }
        if (args.some(a => a.includes('/compare/'))) return MERGE_BASE;
        const url = args.find(a => a.includes('/contents/'));
        if (url) return url.endsWith(`ref=${HEAD}`) ? headText : BASE_TEXT;
        if (args.some(a => a.includes('/pulls/'))) return files.join('\n') + '\n';
        if (args.some(a => a.includes('/issues/'))) {
          return JSON.stringify([
            [
              {
                body: evidence,
                created_at: '2026-09-05T16:00:00Z',
                updated_at: '2026-09-05T16:00:00Z',
                author_association: 'OWNER',
                user: { login: 'rbeezley' },
              },
            ],
          ]);
        }
        throw new Error(`unexpected gh call: ${args.join(' ')}`);
      };

    it('passes adversarial evidence for a lowering-only baseline', () => {
      expect(runCli(env, ['--dry-run'], fake([BASELINE], baselineJson(3, { 'a.ts': 3 })))).toBe(0);
    });

    it('refuses it when the baseline count was raised', () => {
      const raised = baselineJson(9, { 'a.ts': 7, 'b.ts': 2 });
      expect(runCli(env, ['--dry-run'], fake([BASELINE], raised))).toBe(1);
    });

    it('refuses it when another guardrail file rides along', () => {
      const lowered = baselineJson(3, { 'a.ts': 3 });
      expect(runCli(env, ['--dry-run'], fake([BASELINE, GUARD], lowered))).toBe(1);
    });
  });
});
