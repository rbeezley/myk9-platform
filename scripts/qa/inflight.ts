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
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export interface ChangeSource {
  kind: 'pr' | 'worktree' | 'branch';
  /** For a worktree: its uncommitted/untracked files alone — kept even when its branch already merged. */
  dirty?: string[];
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
  // -z: NUL-separated records with NO display quoting, so a path containing a
  // space or a non-ASCII character comes back verbatim (porcelain v1 without
  // -z prints it as "quoted\\escaped"). A rename/copy record is followed by
  // the old path as its own record; both sides are touched.
  const raw = run('git', ['status', '--porcelain', '-z', '--untracked-files=all'], { cwd });
  const records = raw.split(String.fromCharCode(0)).filter(r => r.length > 0);
  const out: string[] = [];
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    if (rec.length < 4) continue;
    out.push(rec.slice(3));
    if (rec[0] === 'R' || rec[0] === 'C') {
      const old = records[i + 1];
      if (old) {
        out.push(old);
        i += 1;
      }
    }
  }
  return out;
}

export function currentBranch(cwd?: string): string {
  return run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).trim();
}

/** Committed paths past `base` on `ref`, counting BOTH sides of a rename. */
export function committedPaths(base: string, ref: string, cwd?: string): string[] {
  // No allowFail: a comparison that cannot run is an UNKNOWN result, not an empty one.
  const raw = run('git', ['diff', '--name-status', '-M', '-z', `${base}...${ref}`], { cwd });
  const records = raw.split(String.fromCharCode(0)).filter(r => r.length > 0);
  const out: string[] = [];
  for (let i = 0; i < records.length; i += 1) {
    const status = records[i];
    const path = records[i + 1];
    if (path === undefined) break;
    out.push(path);
    i += 1;
    if (status.startsWith('R') || status.startsWith('C')) {
      const newPath = records[i + 1];
      if (newPath !== undefined) {
        out.push(newPath);
        i += 1;
      }
    }
  }
  return out;
}

/** Paths this checkout would bring to a PR: committed past base, modified, and untracked. */
export function localChangedPaths(base: string, cwd?: string): string[] {
  return [...new Set([...committedPaths(base, 'HEAD', cwd), ...statusPaths(cwd)])];
}

interface GhPr {
  number: number;
  headRefName: string;
  url?: string;
  author?: { login?: string };
  files?: { path: string }[];
}

export class InflightQueryError extends Error {}

function ghJson<T>(args: string[], what: string): T {
  try {
    const raw = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(raw) as T;
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    throw new InflightQueryError(
      `could not list ${what}: ${(e.stderr || e.message || '').trim().split('\n')[0]}`
    );
  }
}

/** Throws when `gh` cannot answer — an unknown PR list must never read as clean. */
export function openPullRequests(): ChangeSource[] {
  const prs = ghJson<GhPr[]>(
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
    'open PRs'
  );
  return prs.map(pr => ({
    kind: 'pr',
    id: `#${pr.number}`,
    branch: pr.headRefName,
    owner: pr.author?.login,
    url: pr.url,
    files: (pr.files ?? []).map(f => f.path),
  }));
}

/** Branch names whose PR already merged — a squash merge leaves the branch a non-ancestor of main. */
export function mergedPrBranches(): Set<string> {
  const prs = ghJson<{ headRefName: string }[]>(
    ['pr', 'list', '--state', 'merged', '--limit', '300', '--json', 'headRefName'],
    'merged PRs'
  );
  return new Set(prs.map(pr => pr.headRefName));
}

export function otherWorktrees(base: string, cwd?: string): ChangeSource[] {
  const here = run('git', ['rev-parse', '--show-toplevel'], { cwd }).trim();
  const out: ChangeSource[] = [];
  let path = '';
  let branch = '';
  let head = '';
  const flush = () => {
    if (!path || path === here) return;
    if (!existsSync(path)) return; // prunable entry: nothing is happening in a directory that is gone
    // A detached worktree has commits too — compare its HEAD sha, not a branch.
    const ref = branch || head;
    const committed = ref ? committedPaths(base, ref, cwd) : [];
    const dirty = statusPaths(path);
    const files = [...new Set([...committed, ...dirty])];
    if (files.length)
      out.push({ kind: 'worktree', id: path, branch: branch || undefined, files, dirty });
  };
  for (const line of run('git', ['worktree', 'list', '--porcelain'], { cwd }).split('\n')) {
    if (line.startsWith('worktree ')) {
      flush();
      path = line.slice('worktree '.length).trim();
      branch = '';
      head = '';
    } else if (line.startsWith('HEAD ')) {
      head = line.slice('HEAD '.length).trim();
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
  cwd?: string
): ChangeSource[] {
  const names = lines(
    run('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], {
      cwd,
      allowFail: true,
    })
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
    const files = committedPaths(base, name, cwd);
    if (files.length) out.push({ kind: 'branch', id: name, branch: name, files });
  }
  return out;
}

export function runCli(argv = process.argv.slice(2), cwd = process.cwd()): number {
  try {
    return runCliInner(argv, cwd);
  } catch (error) {
    console.error(`inflight: ${(error as Error).message.split(String.fromCharCode(10))[0]}`);
    console.error('inflight: a git or gh query failed, so this is NOT a clean result (exit 2).');
    return 2;
  }
}

function runCliInner(argv: string[], cwd: string): number {
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
  let prs: ChangeSource[];
  let merged: Set<string>;
  try {
    prs = openPullRequests();
    merged = mergedPrBranches();
  } catch (error) {
    console.error(`inflight: ${(error as Error).message}`);
    console.error(
      'inflight: cannot see in-flight PRs, so this is NOT a clean result (exit 2). Fix gh auth or network and re-run.'
    );
    return 2;
  }
  // A squash-merged branch is no ancestor of main but is finished: skip it,
  // and skip other worktrees whose branch already merged for the same reason.
  for (const b of merged) wtBranches.add(b);
  // A worktree whose branch already merged still counts for whatever is
  // UNCOMMITTED in it — that is new work with no PR yet (Codex, #2073 round 2).
  const liveWorktrees = worktrees.flatMap(w => {
    if (!w.branch || !merged.has(w.branch)) return [w];
    const dirty = w.dirty ?? [];
    return dirty.length ? [{ ...w, files: dirty }] : [];
  });
  const sources = [...prs, ...liveWorktrees, ...unmergedLocalBranches(base, wtBranches, cwd)];
  const ownPr = prs.find(p => p.branch === branch);
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
