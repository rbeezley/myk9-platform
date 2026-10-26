/**
 * Real GitHub and git readers for the issue janitor. REST only, paged by
 * `ghPages` (never `gh api --paginate`, MYK9-1425). Read-only: nothing here
 * writes, deletes a branch, or touches Linear.
 */
import { execFileSync } from 'node:child_process';
import { GH_MAX_PAGES, ghPages } from './gh-pages.ts';
import {
  BRANCH_PREFIXES,
  type BranchInfo,
  type GitHubReader,
  type PrInfo,
} from './issue-janitor-types.ts';

export const REPO = 'rbeezley/myk9-platform';

type Exec = (cmd: string, args: string[]) => string;

const defaultExec: Exec = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });

interface RawPull {
  number: number;
  html_url: string;
  state: string;
  merged_at: string | null;
  closed_at: string | null;
  title: string;
  body: string | null;
  merge_commit_sha: string | null;
  head: { ref: string; sha: string };
}

function ghJson<T>(exec: Exec, path: string): T {
  return JSON.parse(exec('gh', ['api', path])) as T;
}

function ghRows<T>(exec: Exec, path: string, unwrap?: string): T[] {
  return ghPages<T>(args => {
    const parsed = JSON.parse(exec('gh', args)) as unknown;
    if (unwrap) return ((parsed as Record<string, T[]>)[unwrap] ?? []) as T[];
    return parsed as T[];
  }, path);
}

export type LinkKind = 'full' | 'partial';

/** How a PR links the issue: null when it does not. `Ignore` without `Fixes` is partial. */
export function linksIssue(pull: RawPull, n: number): LinkKind | null {
  const body = pull.body ?? '';
  const fixes = new RegExp(`\\bFixes\\s+MYK9-${n}\\b`, 'i').test(body);
  const ignore = new RegExp(`\\bIgnore\\s+MYK9-${n}\\b`, 'i').test(body);
  const prefixes = BRANCH_PREFIXES.map(p => `${p}myk9-${n}-`);
  const byBranch = prefixes.some(p => pull.head.ref.toLowerCase().startsWith(p));
  if (ignore && !fixes) return 'partial';
  return fixes || byBranch ? 'full' : null;
}

/** PRs untouched for longer than this are never fetched (the list is newest-updated first). */
const PR_WINDOW_MS = 365 * 24 * 3_600_000;

export function makeGitHubReader(
  exec: Exec = defaultExec,
  now: () => number = Date.now
): GitHubReader {
  let all: RawPull[] | null = null;
  const repoPulls = (): RawPull[] => {
    if (all) return all;
    const cutoff = now() - PR_WINDOW_MS;
    const rows: RawPull[] = [];
    for (let page = 1; page <= GH_MAX_PAGES; page++) {
      const batch = JSON.parse(
        exec('gh', [
          'api',
          `repos/${REPO}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`,
        ])
      ) as (RawPull & { updated_at: string })[];
      rows.push(...batch);
      const last = batch[batch.length - 1];
      if (batch.length < 100 || (last && Date.parse(last.updated_at) < cutoff)) break;
    }
    all = rows;
    return rows;
  };
  const detail = (pull: RawPull, kind: LinkKind): PrInfo => {
    const commit = ghJson<{ commit: { committer: { date: string } } }>(
      exec,
      `repos/${REPO}/commits/${pull.head.sha}`
    );
    const merged = pull.merged_at !== null;
    let closeNote: string | null = null;
    if (pull.state === 'closed' && !merged) {
      const comments = ghRows<{ body: string }>(
        exec,
        `repos/${REPO}/issues/${pull.number}/comments`
      );
      const last = comments[comments.length - 1]?.body;
      closeNote = (last ?? pull.title).replace(/\s+/g, ' ').slice(0, 200);
    }
    return {
      number: pull.number,
      url: pull.html_url,
      state: pull.state === 'open' ? 'open' : 'closed',
      merged,
      partial: kind === 'partial',
      headRefName: pull.head.ref,
      headSha: pull.head.sha,
      headCommittedAt: commit.commit.committer.date,
      mergedAt: pull.merged_at,
      closedAt: pull.closed_at,
      closeNote,
    };
  };
  return {
    prsForIssue(n, branchNames) {
      const found = new Map<number, { pull: RawPull; kind: LinkKind }>();
      for (const pull of repoPulls()) {
        const kind = linksIssue(pull, n);
        if (kind) found.set(pull.number, { pull, kind });
      }
      const owner = REPO.split('/')[0];
      for (const name of branchNames) {
        const rows = ghRows<RawPull>(
          exec,
          `repos/${REPO}/pulls?state=all&head=${owner}:${encodeURIComponent(name)}`
        );
        for (const pull of rows) {
          if (!found.has(pull.number))
            found.set(pull.number, { pull, kind: linksIssue(pull, n) ?? 'full' });
        }
      }
      return [...found.values()].map(({ pull, kind }) => detail(pull, kind));
    },
    isDeployed(pr, deployedCommit) {
      const pull = ghJson<RawPull>(exec, `repos/${REPO}/pulls/${pr.number}`);
      if (!pull.merge_commit_sha) return false;
      const cmp = ghJson<{ status: string }>(
        exec,
        `repos/${REPO}/compare/${pull.merge_commit_sha}...${deployedCommit}`
      );
      return cmp.status === 'ahead' || cmp.status === 'identical';
    },
  };
}

/** Branches matching any janitor prefix, pushed or local, with the newest commit date. */
export function readBranches(
  exec: Exec = defaultExec,
  extraNames: Iterable<string> = []
): BranchInfo[] {
  const extras = new Set(extraNames);
  const wanted = (name: string) =>
    extras.has(name) || BRANCH_PREFIXES.some(p => name.toLowerCase().startsWith(`${p}myk9-`));
  const tips = new Map<string, Set<string>>();
  const addTip = (name: string, sha: string) => {
    const set = tips.get(name) ?? new Set<string>();
    tips.set(name, set.add(sha));
  };
  const worktrees = new Map<string, string>();

  const worktreeOut = exec('git', ['worktree', 'list', '--porcelain']);
  let currentTree = '';
  for (const line of worktreeOut.split('\n')) {
    if (line.startsWith('worktree ')) currentTree = line.slice('worktree '.length);
    if (line.startsWith('branch refs/heads/'))
      worktrees.set(line.slice('branch refs/heads/'.length), currentTree);
  }

  const remote = exec('git', ['ls-remote', '--heads', 'origin']);
  for (const line of remote.split('\n')) {
    const [sha, ref] = line.split('\t');
    if (!sha || !ref?.startsWith('refs/heads/')) continue;
    const name = ref.slice('refs/heads/'.length);
    if (wanted(name)) addTip(name, sha);
  }
  const local = exec('git', [
    'for-each-ref',
    '--format=%(refname:short) %(objectname)',
    'refs/heads',
  ]);
  for (const line of local.split('\n')) {
    const [name, sha] = line.split(' ');
    if (name && sha && wanted(name)) addTip(name, sha);
  }

  const dateOf = (sha: string): string => {
    try {
      return exec('git', ['log', '-1', '--format=%cI', sha]).trim();
    } catch {
      return ghJson<{ commit: { committer: { date: string } } }>(
        exec,
        `repos/${REPO}/commits/${sha}`
      ).commit.committer.date;
    }
  };
  // A name can have a remote tip and a newer local one (unpushed commits): keep the newest date.
  return [...tips].map(([name, shas]) => ({
    name,
    tipAt: [...shas].map(dateOf).reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b)),
    worktree: worktrees.get(name) ?? null,
  }));
}
