/**
 * Is anything using this worktree? Answers from process evidence, never from
 * a session's `isRunning` / `lastActivityAt` (MYK9-599): on 2026-09-15 one
 * session read `isRunning: true` from `list_sessions` and `false` from
 * `get_session` a minute later with nothing changed, another read `true`
 * while its worktree no longer existed, and `lastActivityAt` advanced in
 * lockstep across idle sessions — a heartbeat, not activity.
 *
 * Evidence, per worktree:
 *   holders   processes whose cwd is the tree or inside it (`lsof -d cwd`)
 *   children  every descendant of a holder, wherever its cwd is
 *   cpu       CPU seconds the holders and children accrue over a window,
 *             sampled twice with `ps -o time=`
 *   writes    files under the tree they hold open for writing (`lsof -p`)
 *
 * Verdict:
 *   free   no holders: nothing has its cwd there                     exit 0
 *   busy   cpu >= threshold of one core, or any write handle         exit 1
 *   quiet  held, but under the threshold with no write handles       exit 3
 *   (the check could not run)                                        exit 2
 *
 * The default threshold, 10% of one core over 15s, separates polling from
 * work: the idle session measured on 2026-09-15 accrued 0.69s over 15s
 * (4.6%), which is MCP polling. `quiet` is NOT proof of abandonment — a
 * session waiting on a model reply is quiet too — so it decides nothing on its
 * own; the cleanup skill still asks before stopping anything.
 *
 * Every verdict is ADVISORY. The check sees only processes whose cwd is inside
 * the tree: a process running from elsewhere that holds a tree file open for
 * writing is invisible, so `free` does not mean nothing writes there
 * (follow-up: "worktree-liveness: detect write handles from processes outside
 * the tree"). Never chain `free` into `git worktree remove --force`; plain
 * `git worktree remove` refuses a tree with modified or untracked files, and
 * that refusal is the backstop.
 *
 * Usage: pnpm -s qa:worktree-liveness "<worktree path>" [--window 15] [--threshold 10]
 */
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_WINDOW_SECONDS = 15;
export const DEFAULT_THRESHOLD_PERCENT = 10;

export interface ProcessInfo {
  pid: number;
  ppid: number;
  cpuSeconds: number;
  command: string;
}

export type Verdict = 'free' | 'busy' | 'quiet';

export interface Liveness {
  verdict: Verdict;
  holders: ProcessInfo[];
  descendants: ProcessInfo[];
  cpuPercent: number;
  writes: { pid: number; path: string }[];
  /** The chain that launched this check has its cwd in the tree (excluded from holders). */
  callerHolds: boolean;
}

/**
 * `ps -o time=`: macOS prints `M:SS.ss` (minutes may exceed 59), Linux
 * `[D-]HH:MM:SS`. Returns seconds, or NaN for anything else.
 */
export function parseCpuTime(text: string): number {
  const m = /^(?:(\d+)-)?(\d+(?::\d+){0,2}(?:\.\d+)?)$/.exec(text.trim());
  if (!m) return NaN;
  const days = m[1] ? Number(m[1]) : 0;
  const parts = m[2]!.split(':').map(Number);
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return days * 86400 + seconds;
}

/** `ps -A -o pid=,ppid=,time=,comm=`; the command is the rest of the line and may hold spaces. */
export function parsePsTable(text: string): Map<number, ProcessInfo> {
  const out = new Map<number, ProcessInfo>();
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s?(.*)$/.exec(line);
    if (!m) continue;
    const cpuSeconds = parseCpuTime(m[3]!);
    if (Number.isNaN(cpuSeconds)) continue;
    const pid = Number(m[1]);
    out.set(pid, { pid, ppid: Number(m[2]), cpuSeconds, command: m[4]!.trim() });
  }
  return out;
}

export interface LsofFile {
  pid: number;
  fd: string;
  access: string;
  name: string;
}

/**
 * `lsof -F` field output: a `p` line opens a process, an `f` line opens a
 * file inside it, and `a` / `n` lines describe that file. Each field is the
 * whole rest of its line, so paths with spaces survive.
 */
export function parseLsofFields(text: string): LsofFile[] {
  const out: LsofFile[] = [];
  let pid = NaN;
  let current: LsofFile | undefined;
  for (const line of text.split('\n')) {
    const tag = line[0];
    const value = line.slice(1);
    if (tag === 'p') {
      pid = Number(value);
      current = undefined;
    } else if (tag === 'f') {
      current = { pid, fd: value, access: '', name: '' };
      out.push(current);
    } else if (tag === 'a' && current) {
      current.access = value.trim();
    } else if (tag === 'n') {
      // `-d cwd` output may omit the f line on some builds; still record it.
      if (!current || current.name) {
        current = { pid, fd: 'cwd', access: '', name: '' };
        out.push(current);
      }
      current.name = value;
    }
  }
  return out.filter(f => !Number.isNaN(f.pid));
}

/** True when `path` is `root` or inside it; `/a/bc` is not inside `/a/b`. */
export function isUnder(path: string, root: string): boolean {
  const r = root.endsWith(sep) ? root.slice(0, -1) : root;
  return path === r || path.startsWith(r + sep);
}

export function descendantsOf(
  roots: readonly number[],
  table: ReadonlyMap<number, ProcessInfo>
): ProcessInfo[] {
  const children = new Map<number, number[]>();
  for (const p of table.values()) children.set(p.ppid, [...(children.get(p.ppid) ?? []), p.pid]);
  const seen = new Set(roots);
  const out: ProcessInfo[] = [];
  const queue = [...roots];
  while (queue.length) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      const info = table.get(child);
      if (info) out.push(info);
      queue.push(child);
    }
  }
  return out;
}

/** `pid` and every process above it, up to (not including) pid 0. */
export function ancestorsOf(pid: number, table: ReadonlyMap<number, ProcessInfo>): Set<number> {
  const out = new Set<number>();
  for (let p: number | undefined = pid; p && !out.has(p); p = table.get(p)?.ppid) out.add(p);
  return out;
}

export function decide(
  hasHolders: boolean,
  cpuPercent: number,
  writeCount: number,
  thresholdPercent: number
): Verdict {
  if (!hasHolders) return 'free';
  return cpuPercent >= thresholdPercent || writeCount > 0 ? 'busy' : 'quiet';
}

/**
 * Fails closed: the cleanup skill chains FREE into a plain `git worktree
 * remove`, so a probe that did not run must never read as "nothing holds the
 * tree". lsof
 * exits 1 when some process could not be inspected yet prints every one it
 * could, so callers pass the statuses they accept and a positive control.
 */
function run(cmd: string, args: readonly string[], okStatuses: readonly number[]): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status === null || !okStatuses.includes(r.status)) {
    const why = r.status === null ? `signal ${r.signal}` : `exit ${r.status}`;
    throw new Error(`${cmd} failed (${why}): ${r.stderr.trim().split('\n')[0] ?? ''}`);
  }
  return r.stdout;
}

function psTable(): Map<number, ProcessInfo> {
  const table = parsePsTable(run('ps', ['-A', '-o', 'pid=,ppid=,time=,comm='], [0]));
  if (!table.has(process.pid)) throw new Error('ps did not list this process; cannot trust it');
  return table;
}

function cwdTable(): LsofFile[] {
  const files = parseLsofFields(run('lsof', ['-a', '-d', 'cwd', '-F', 'pn'], [0, 1]));
  // Positive control: this process has a cwd, so a listing without it is partial.
  if (!files.some(f => f.pid === process.pid)) {
    throw new Error('lsof did not list this process; cannot trust its cwd table');
  }
  return files;
}

function sleep(seconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

export function measure(
  worktree: string,
  windowSeconds = DEFAULT_WINDOW_SECONDS,
  thresholdPercent = DEFAULT_THRESHOLD_PERCENT
): Liveness {
  const root = realpathSync(worktree);
  // lsof first, ps second: a holder that starts in between is then still in
  // the table, and one that exits in between is only dropped.
  const cwdPids = cwdTable()
    .filter(f => isUnder(f.name, root))
    .map(f => f.pid);
  const before = psTable();
  // This process and the chain that launched it (pnpm, the shell, the
  // asking session) are the question, not the answer.
  const caller = ancestorsOf(process.pid, before);
  const callerHolds = cwdPids.some(p => caller.has(p));
  const holderPids = [...new Set(cwdPids.filter(p => !caller.has(p)))];
  const holders = holderPids.flatMap(p => before.get(p) ?? []);
  if (holders.length === 0) {
    return {
      verdict: 'free',
      holders: [],
      descendants: [],
      cpuPercent: 0,
      writes: [],
      callerHolds,
    };
  }
  const descendants = descendantsOf(holderPids, before).filter(p => !caller.has(p.pid));
  const watched = [...holders, ...descendants];

  sleep(windowSeconds);
  const after = psTable();
  // A process that exited during the window contributes nothing it can be blamed for.
  const accrued = watched.reduce((sum, p) => {
    const later = after.get(p.pid);
    return later ? sum + Math.max(0, later.cpuSeconds - p.cpuSeconds) : sum;
  }, 0);
  const cpuPercent = (accrued / windowSeconds) * 100;

  const writes = parseLsofFields(
    // Exit 1 here also means a watched process exited during the window.
    run('lsof', ['-a', '-p', watched.map(p => p.pid).join(','), '-F', 'pfan'], [0, 1])
  )
    .filter(f => /[wu]/.test(f.access) && isUnder(f.name, root))
    .map(f => ({ pid: f.pid, path: f.name }));

  return {
    verdict: decide(true, cpuPercent, writes.length, thresholdPercent),
    holders,
    descendants,
    cpuPercent,
    writes,
    callerHolds,
  };
}

export const EXIT: Readonly<Record<Verdict, number>> = { free: 0, busy: 1, quiet: 3 };

export function render(worktree: string, l: Liveness, windowSeconds: number): string {
  const lines = [`worktree-liveness: ${l.verdict.toUpperCase()} — ${worktree}`];
  if (l.callerHolds) {
    lines.push(
      '  note    the process chain running this check has its cwd here and is not counted;\n' +
        '          removing this tree unmounts the caller (cleanup skill: worktree removal goes last)'
    );
  }
  if (l.verdict === 'free') {
    lines.push('  no other process has its cwd in this tree');
    lines.push(
      '  advisory: processes outside the tree that write into it are not seen; remove with plain\n' +
        '          `git worktree remove` (never --force) and stop if git refuses'
    );
    return lines.join('\n');
  }
  for (const p of l.holders) lines.push(`  holder  pid ${p.pid}  ${p.command}`);
  for (const p of l.descendants) lines.push(`  child   pid ${p.pid} (of ${p.ppid})  ${p.command}`);
  lines.push(`  cpu     ${l.cpuPercent.toFixed(1)}% of one core over ${windowSeconds}s`);
  lines.push(`  writes  ${l.writes.length === 0 ? 'none under the tree' : ''}`.trimEnd());
  for (const w of l.writes) lines.push(`          pid ${w.pid}  ${w.path}`);
  return lines.join('\n');
}

function flag(argv: readonly string[], name: string, fallback: number): number {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  const n = Number(argv[i + 1]);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} needs a positive number`);
  return n;
}

export function runCli(argv: readonly string[]): number {
  const worktree = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
  if (!worktree) {
    console.error(
      'usage: worktree-liveness "<worktree path>" [--window seconds] [--threshold percent]'
    );
    return 2;
  }
  try {
    const windowSeconds = flag(argv, '--window', DEFAULT_WINDOW_SECONDS);
    const threshold = flag(argv, '--threshold', DEFAULT_THRESHOLD_PERCENT);
    const result = measure(worktree, windowSeconds, threshold);
    console.log(render(worktree, result, windowSeconds));
    return EXIT[result.verdict];
  } catch (err) {
    console.error(`worktree-liveness: ${(err as Error).message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2));
}
