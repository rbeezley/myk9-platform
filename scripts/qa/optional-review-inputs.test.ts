import { describe, expect, it } from 'vitest';
import { fetchAddedFiles, verifyDependencyManifests } from './optional-review-inputs';
import { runCli, type EvaluateReviewGateInput } from './review-gate';

const REPO = 'o/r';
const HEAD = 'a'.repeat(40);
const BASE_TIP = 'b'.repeat(40);
const MERGE_BASE = 'c'.repeat(40);

const manifest = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: 'myk9show',
    scripts: { test: 'vitest run' },
    dependencies: { react: '19.1.0' },
    ...overrides,
  });

/** A fake `gh` that serves manifests by ref and records every call. */
function fakeGh(files: Record<string, { base: string; head: string }>) {
  const calls: string[][] = [];
  const run = (args: string[]): string => {
    calls.push(args);
    const url = args.at(-1) ?? '';
    if (url.includes('/compare/')) return `${MERGE_BASE}\n`;
    const match = /contents\/(.+)\?ref=(\w+)$/.exec(url);
    if (match) {
      const entry = files[match[1]!];
      if (!entry) throw new Error('HTTP 404');
      if (match[2] === MERGE_BASE) return entry.base;
      if (match[2] === HEAD) return entry.head;
      throw new Error(`read at unexpected ref ${match[2]}`);
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
  return { run, calls };
}

const labeled = {
  changedFiles: ['apps/myk9show/package.json', 'pnpm-lock.yaml'],
  labels: ['dependencies'],
  baseSha: BASE_TIP,
  headSha: HEAD,
};

describe('verifyDependencyManifests', () => {
  it('verifies a dependency bump compared at the MERGE BASE, not the base tip', () => {
    const { run, calls } = fakeGh({
      'apps/myk9show/package.json': {
        base: manifest(),
        head: manifest({ dependencies: { react: '19.2.0' } }),
      },
    });
    expect(verifyDependencyManifests(run, REPO, labeled)).toBe(true);
    expect(calls[0]?.at(-1)).toBe(`repos/${REPO}/compare/${BASE_TIP}...${HEAD}`);
  });

  it('refuses a labeled PR that repoints a script', () => {
    const { run } = fakeGh({
      'apps/myk9show/package.json': {
        base: manifest(),
        head: manifest({ scripts: { test: 'exit 0' } }),
      },
    });
    expect(verifyDependencyManifests(run, REPO, labeled)).toBe(false);
  });

  it('fails closed when a manifest cannot be read (added, deleted, or API error)', () => {
    const { run } = fakeGh({});
    expect(verifyDependencyManifests(run, REPO, labeled)).toBe(false);
  });

  it('fails closed without a base SHA', () => {
    const { run } = fakeGh({});
    expect(verifyDependencyManifests(run, REPO, { ...labeled, baseSha: undefined })).toBe(false);
  });

  it('does not call GitHub when the route cannot apply', () => {
    const { run, calls } = fakeGh({});
    expect(verifyDependencyManifests(run, REPO, { ...labeled, labels: [] })).toBeUndefined();
    expect(
      verifyDependencyManifests(run, REPO, { ...labeled, changedFiles: ['apps/myk9show/src/a.ts'] })
    ).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('verifies a lockfile-only change without reading any manifest', () => {
    const { run } = fakeGh({});
    expect(
      verifyDependencyManifests(run, REPO, { ...labeled, changedFiles: ['pnpm-lock.yaml'] })
    ).toBe(true);
  });
});

describe('fetchAddedFiles', () => {
  it('asks the files endpoint for ADDED files only', () => {
    let seen: string[] = [];
    const files = fetchAddedFiles(
      args => {
        seen = args;
        return 'a.test.ts\n\nb.ts\n';
      },
      REPO,
      '7'
    );
    expect(files).toEqual(['a.test.ts', 'b.ts']);
    expect(seen).toContain('.[] | select(.status == "added") | .filename');
    expect(seen.at(-1)).toBe(`repos/${REPO}/pulls/7/files?per_page=100`);
  });

  it('reads an API failure as nothing added', () => {
    expect(
      fetchAddedFiles(
        () => {
          throw new Error('HTTP 502');
        },
        REPO,
        '7'
      )
    ).toEqual([]);
  });
});

describe('runCli threads the optional-review inputs to the evaluator', () => {
  it('passes added files and verified manifests from GitHub', () => {
    const { run: manifests } = fakeGh({
      'apps/myk9show/package.json': {
        base: manifest(),
        head: manifest({ dependencies: { react: '19.2.0' } }),
      },
    });
    const run = (args: string[]): string => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({
          headRefOid: HEAD,
          baseRefOid: BASE_TIP,
          isDraft: false,
          changedFiles: 2,
          labels: [{ name: 'dependencies' }],
        });
      }
      const url = args.at(-1) ?? '';
      if (url.includes('/pulls/')) {
        return args.some(a => a.includes('"added"'))
          ? 'pnpm-lock.yaml\n'
          : 'apps/myk9show/package.json\npnpm-lock.yaml\n';
      }
      if (url.includes('/issues/')) return JSON.stringify([[]]);
      return manifests(args);
    };
    let seen: EvaluateReviewGateInput | undefined;
    runCli({ PR_NUMBER: '7', REPO } as NodeJS.ProcessEnv, ['--dry-run'], run, input => {
      seen = input;
      return { state: 'failure', description: 'captured' };
    });

    expect(seen?.addedFiles).toEqual(['pnpm-lock.yaml']);
    expect(seen?.dependencyManifestsVerified).toBe(true);
  });
});
