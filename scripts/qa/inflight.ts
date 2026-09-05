/**
 * In-flight check — refuse to start work that something else is already doing.
 *
 * On 2026-09-05 two sessions each spent a dozen review rounds on the same
 * untracked `.agents/skills` directories: #2062 was open for 43 minutes
 * before #2064 was created, and one `gh pr list` by path would have shown it.
 * The rule "list open PRs by file before any fix" existed as a memory and was
 * skipped. This makes it a program the commit and ship-pr skills run.
 *
 * Sources of in-flight change:
 *   - open pull requests (files from `gh pr list --json files`)
 *   - other git worktrees on this machine: their branch's commits past
 *     origin/main PLUS their uncommitted and untracked files — work that has
 *     no PR yet is exactly the work a PR list cannot show
 *   - unmerged local branches not checked out anywhere
 *
 * Overlap is exact path or directory prefix in either direction. The current
 * branch and its own PR are excluded. Exit 1 on any overlap so a chained
 * `pnpm qa:inflight && …` stops; `--warn` reports without failing. Linear
 * "In Progress" issues and other Claude sessions are MCP tools, not shell,
 * and stay as the skill's manual steps.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export interface ChangeSource {
  kind: 'pr' | 'worktree' | 'branch';
  /** "#2062", a worktree path, or a branch name. */
  id: string;
  branch?: string;
  owner?: string;
  url?: string;
  files: string[];
}

export interface Overlap {
  path: string;
  matched: string;
  source: ChangeSource;
}

export function normalizePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/\/+$/, '');
}

/** Exact match, or one path is a directory containing the other. */
export function pathsOverlap(a: string, b: string): boolean {
  const x = normalizePath(a);
  const y = normalizePath(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y + '/') || y.startsWith(x + '/');
}

export function findOverlaps(
  paths: readonly string[],
  sources: readonly ChangeSource[],
  exclude: { branch?: string; prNumber?: number } = {}
): Overlap[] {
  const out: Overlap[] = [];
  for (const source of sources) {
    if (exclude.branch && source.branch === exclude.branch) continue;
    if (exclude.prNumber && source.kind === 'pr' && source.id === `#${exclude.prNumber}`) continue;
    for (const path of paths) {
      for (const file of source.files) {
        if (pathsOverlap(path, file))
          out.push({ path: normalizePath(path), matched: normalizePath(file), source });
      }
    }
  }
  return out;
}

export function renderOverlaps(overlaps: readonly Overlap[]): string {
  if (overlaps.length === 0)
    return 'inflight: no open PR, other worktree, or unmerged branch touches these paths.';
  const bySource = new Map<string, Overlap[]>();
  for (const o of overlaps) {
    const key = `${o.source.kind} ${o.source.id}`;
    bySource.set(key, [...(bySource.get(key) ?? []), o]);
  }
  const lines = [
    `inflight: ${overlaps.length} overlap(s) with work already in flight — coordinate before continuing:`,
  ];
  for (const [key, list] of bySource) {
    const s = list[0].source;
    const meta = [s.branch && `branch ${s.branch}`, s.owner && `by ${s.owner}`, s.url]
      .filter(Boolean)
      .join(', ');
    lines.push(`  ${key}${meta ? ` (${meta})` : ''}`);
    for (const o of list.slice(0, 8)) lines.push(`    ${o.path}  ~  ${o.matched}`);
    if (list.length > 8) lines.push(`    … and ${list.length - 8} more`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- gathering

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; allowFail?: boolean } = {}
): string {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    if (opts.allowFail) return '';
    throw error;
  }
}

function lines(s: string): string[] {
  return s
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

/**
 * Paths from `git status --porcelain`: two status columns, a space, then the
 * path (a rename shows as `old -> new`). Do NOT trim these lines first — a
 * leading space is the "unmodified in index" column, and trimming it made
 * `slice(3)` eat the first character of the path (`rc/a.ts`).
 */
export function statusPaths(cwd?: string): string[] {
  return run('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, allowFail: true })
    .split('\n')
    .filter(l => l.length > 3)
    .map(l => l.slice(3).replace(/^.* -> /, ''));
}

export function currentBranch(cwd?: string): string {
  return run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).trim();
}

/** Paths this checkout would bring to a PR: committed past base, modified, and untracked. */
export function localChangedPaths(base: string, cwd?: string): string[] {
  const committed = lines(
    run('git', ['diff', '--name-only', `${base}...HEAD`], { cwd, allowFail: true })
  );
  const dirty = statusPaths(cwd);
  return [...new Set([...committed, ...dirty])];
}

interface GhPr {
  number: number;
  headRefName: string;
  url?: string;
  author?: { login?: string };
  files?: { path: string }[];
}

export function openPullRequests(): ChangeSource[] {
  const raw = run(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      'number,headRefName,url,author,files',
    ],
    {
      allowFail: true,
    }
  );
  if (!raw.trim()) return [];
  const prs = JSON.parse(raw) as GhPr[];
  return prs.map(pr => ({
    kind: 'pr',
    id: `#${pr.number}`,
    branch: pr.headRefName,
    owner: pr.author?.login,
    url: pr.url,
    files: (pr.files ?? []).map(f => f.path),
  }));
}

export function otherWorktrees(base: string, cwd?: string): ChangeSource[] {
  const here = run('git', ['rev-parse', '--show-toplevel'], { cwd }).trim();
  const out: ChangeSource[] = [];
  let path = '';
  let branch = '';
  const flush = () => {
    if (!path || path === here) return;
    const committed = branch
      ? lines(run('git', ['diff', '--name-only', `${base}...${branch}`], { cwd, allowFail: true }))
      : [];
    const dirty = statusPaths(path);
    const files = [...new Set([...committed, ...dirty])];
    if (files.length) out.push({ kind: 'worktree', id: path, branch: branch || undefined, files });
  };
  for (const line of run('git', ['worktree', 'list', '--porcelain'], { cwd }).split('\n')) {
    if (line.startsWith('worktree ')) {
      flush();
      path = line.slice('worktree '.length).trim();
      branch = '';
    } else if (line.startsWith('branch ')) {
      branch = line
        .slice('branch '.length)
        .trim()
        .replace(/^refs\/heads\//, '');
    }
  }
  flush();
  return out;
}

export function unmergedLocalBranches(
  base: string,
  skip: ReadonlySet<string>,
  cwd?: string,
  limit = 40
): ChangeSource[] {
  const names = lines(
    run(
      'git',
      [
        'for-each-ref',
        '--sort=-committerdate',
        `--count=${limit}`,
        '--format=%(refname:short)',
        'refs/heads',
      ],
      {
        cwd,
        allowFail: true,
      }
    )
  );
  const out: ChangeSource[] = [];
  for (const name of names) {
    if (name === 'main' || skip.has(name)) continue;
    // Ancestor of the base means merged (or empty): nothing in flight.
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', name, base], { cwd, stdio: 'ignore' });
      continue;
    } catch {
      /* not an ancestor: has commits past base */
    }
    const files = lines(
      run('git', ['diff', '--name-only', `${base}...${name}`], { cwd, allowFail: true })
    );
    if (files.length) out.push({ kind: 'branch', id: name, branch: name, files });
  }
  return out;
}

export function runCli(argv = process.argv.slice(2), cwd = process.cwd()): number {
  const warn = argv.includes('--warn');
  const base = argv.find(a => a.startsWith('--base='))?.slice('--base='.length) ?? 'origin/main';
  const explicit = argv.filter(a => !a.startsWith('--'));
  run('git', ['fetch', '-q', 'origin', 'main'], { cwd, allowFail: true });
  const branch = currentBranch(cwd);
  const paths = explicit.length ? explicit : localChangedPaths(base, cwd);
  if (paths.length === 0) {
    console.log('inflight: nothing to check — no changed paths on this branch and none given.');
    return 0;
  }
  const worktrees = otherWorktrees(base, cwd);
  const wtBranches = new Set(worktrees.map(w => w.branch).filter((b): b is string => !!b));
  wtBranches.add(branch);
  const sources = [
    ...openPullRequests(),
    ...worktrees,
    ...unmergedLocalBranches(base, wtBranches, cwd),
  ];
  const ownPr = openPullRequests().find(p => p.branch === branch);
  const overlaps = findOverlaps(paths, sources, {
    branch,
    prNumber: ownPr ? Number(ownPr.id.slice(1)) : undefined,
  });
  console.log(
    `inflight: checking ${paths.length} path(s) on ${branch} against ${sources.length} in-flight source(s)`
  );
  console.log(renderOverlaps(overlaps));
  if (overlaps.length === 0) return 0;
  console.log(
    'Also check by hand: Linear issues In Progress that name these paths, and other running sessions (list_sessions).'
  );
  return warn ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli();
}
