import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ancestorsOf,
  decide,
  descendantsOf,
  EXIT,
  isUnder,
  measure,
  parseCpuTime,
  parseLsofFields,
  parsePsTable,
  uniqueWrites,
  runCli,
} from './worktree-liveness.ts';

/**
 * MYK9-599: a session's `isRunning` flag contradicted itself within a minute,
 * so the cleanup skill's "is another agent using this worktree?" gate reads
 * process evidence instead. The behaviour tests below start REAL processes in
 * a directory whose name holds a space (this repo lives under "AI Projects";
 * LESSONS guard-word-split) and check the verdict each one earns.
 */

vi.setConfig({ testTimeout: 30_000 });

/** The real lsof, for stubs that fail only the system-wide write scan (macOS /usr/sbin, Linux /usr/bin). */
const REAL_LSOF = spawnSync('sh', ['-c', 'command -v lsof'], { encoding: 'utf8' }).stdout.trim();
if (!REAL_LSOF) throw new Error('lsof is not on PATH; the liveness tests cannot run');

describe('parseCpuTime', () => {
  it.each([
    ['0:00.69', 0.69], // macOS, the idle session from the incident
    ['12:34.50', 754.5],
    ['125:00.00', 7500], // macOS minutes run past 59
    ['00:00:07', 7], // Linux
    ['1:02:03', 3723],
    ['2-01:00:00', 2 * 86400 + 3600],
  ])('%s -> %s seconds', (text, want) => {
    expect(parseCpuTime(text)).toBeCloseTo(want, 5);
  });
  it('rejects anything else', () => {
    expect(parseCpuTime('abc')).toBeNaN();
    expect(parseCpuTime('')).toBeNaN();
  });
});

describe('parsePsTable', () => {
  it('keeps commands with spaces and skips malformed rows', () => {
    const table = parsePsTable(
      [
        '  101     1   0:00.69 /Applications/Claude Code.app/claude',
        '  202   101   1:02.00 node',
        'garbage',
      ].join('\n')
    );
    expect([...table.values()]).toEqual([
      { pid: 101, ppid: 1, cpuSeconds: 0.69, command: '/Applications/Claude Code.app/claude' },
      { pid: 202, ppid: 101, cpuSeconds: 62, command: 'node' },
    ]);
  });
});

describe('parseLsofFields', () => {
  it('reads cwd, access mode and names with spaces', () => {
    const out = [
      'p42',
      'fcwd',
      'n/Users/me/AI Projects/repo/.claude/worktrees/x',
      'f1',
      'aw',
      'n/Users/me/AI Projects/repo/.claude/worktrees/x/.logs/run.log',
      'f3',
      'ar',
      'n/etc/hosts',
      'p43',
      'n/tmp',
    ].join('\n');
    expect(parseLsofFields(out)).toEqual([
      { pid: 42, fd: 'cwd', access: '', name: '/Users/me/AI Projects/repo/.claude/worktrees/x' },
      {
        pid: 42,
        fd: '1',
        access: 'w',
        name: '/Users/me/AI Projects/repo/.claude/worktrees/x/.logs/run.log',
      },
      { pid: 42, fd: '3', access: 'r', name: '/etc/hosts' },
      { pid: 43, fd: 'cwd', access: '', name: '/tmp' },
    ]);
  });
});

describe('uniqueWrites', () => {
  it('counts one write handle once when lsof repeats it per thread (Linux)', () => {
    const repeated = Array.from({ length: 7 }, () => ({ pid: 14442, path: '/wt/a.log' }));
    expect(uniqueWrites(repeated)).toEqual([{ pid: 14442, path: '/wt/a.log' }]);
  });

  it('keeps distinct processes and distinct files apart', () => {
    const writes = [
      { pid: 1, path: '/wt/a.log' },
      { pid: 2, path: '/wt/a.log' },
      { pid: 1, path: '/wt/b.log' },
      { pid: 1, path: '/wt/a.log' },
    ];
    expect(uniqueWrites(writes)).toEqual(writes.slice(0, 3));
  });
});

describe('isUnder', () => {
  it.each([
    ['/a/b', '/a/b', true],
    ['/a/b/c', '/a/b', true],
    ['/a/b/c', '/a/b/', true],
    ['/a/bc', '/a/b', false], // a sibling worktree sharing a name prefix
    ['/a', '/a/b', false],
  ])('%s under %s -> %s', (path, root, want) => {
    expect(isUnder(path, root)).toBe(want);
  });
});

describe('process tree', () => {
  const table = parsePsTable(
    [
      '1 0 0:00.00 init',
      '10 1 0:00.00 a',
      '11 10 0:00.00 b',
      '12 11 0:00.00 c',
      '20 1 0:00.00 z',
    ].join('\n')
  );
  it('descendantsOf walks every generation', () => {
    expect(descendantsOf([10], table).map(p => p.pid)).toEqual([11, 12]);
  });
  it('ancestorsOf climbs to the root', () => {
    expect([...ancestorsOf(12, table)]).toEqual([12, 11, 10, 1]);
  });
});

describe('decide', () => {
  it.each([
    [false, 90, 0, 'free'], // nothing holds the tree: CPU elsewhere is irrelevant
    [false, 0, 1, 'busy'], // a writer whose cwd is elsewhere still makes it busy (MYK9-725)
    [true, 4.6, 0, 'quiet'], // the incident's idle session: MCP polling
    [true, 10, 0, 'busy'], // the threshold itself is work
    [true, 0, 1, 'busy'], // an open write handle is work at any CPU
  ] as const)('holders=%s cpu=%s writes=%s -> %s', (held, cpu, writes, want) => {
    expect(decide(held, cpu, writes, 10)).toBe(want);
  });
  it('exit codes: free 0, busy 1, quiet 3 (2 is reserved for "could not run")', () => {
    expect(EXIT).toEqual({ free: 0, busy: 1, quiet: 3 });
  });
});

describe('measure, against real processes', () => {
  const kids: ChildProcess[] = [];
  const dirs: string[] = [];
  afterEach(() => {
    for (const k of kids.splice(0)) k.kill('SIGKILL');
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function tree(): string {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'live ness ')));
    dirs.push(base);
    const wt = join(base, 'work tree');
    mkdirSync(wt);
    mkdirSync(join(base, 'work tree-sibling'));
    return wt;
  }

  function start(cwd: string, script: string): ChildProcess {
    const child = spawn(process.execPath, ['-e', script], { cwd, stdio: 'ignore' });
    kids.push(child);
    return child;
  }

  /** lsof must see the child's cwd before measuring, or the test races the spawn. */
  async function settle(): Promise<void> {
    await new Promise(r => setTimeout(r, 400));
  }

  it('free: nothing has its cwd there, even with a process in a prefix-sharing sibling', async () => {
    const wt = tree();
    start(`${wt}-sibling`, 'for(;;){}');
    await settle();
    expect(measure(wt, 1).verdict).toBe('free');
  });

  it('quiet: a sleeping holder accrues no CPU and writes nothing', async () => {
    const wt = tree();
    const child = start(wt, 'setInterval(() => {}, 1000)');
    await settle();
    const got = measure(wt, 2);
    expect(got.verdict).toBe('quiet');
    expect(got.holders.map(h => h.pid)).toEqual([child.pid]);
    expect(got.cpuPercent).toBeLessThan(10);
  });

  it('busy: a spinning holder', async () => {
    const wt = tree();
    start(wt, 'for(;;){}');
    await settle();
    const got = measure(wt, 2);
    expect(got.verdict).toBe('busy');
    expect(got.cpuPercent).toBeGreaterThanOrEqual(10);
  });

  it('busy: a holder with a file open for writing under the tree, at no CPU', async () => {
    const wt = tree();
    start(wt, "require('fs').openSync('in progress.log', 'w'); setInterval(() => {}, 1000)");
    await settle();
    const got = measure(wt, 1);
    expect(got.verdict).toBe('busy');
    expect(got.writes.map(w => w.path)).toEqual([join(wt, 'in progress.log')]);
  });

  it('busy: a process whose cwd is OUTSIDE the tree holds a tree file open for writing (MYK9-725)', async () => {
    const wt = tree();
    const target = join(wt, 'written from outside.log');
    const writer = start(
      '/',
      `require('fs').openSync(${JSON.stringify(target)}, 'w'); setInterval(() => {}, 1000)`
    );
    await settle();
    const got = measure(wt, 1);
    expect(got.verdict).toBe('busy');
    expect(got.holders).toEqual([]);
    expect(got.writes).toEqual([{ pid: writer.pid, path: target }]);
  });

  it('busy: an idle holder whose child is working elsewhere', async () => {
    const wt = tree();
    const script = [
      "const { spawn } = require('child_process');",
      "spawn(process.execPath, ['-e', 'for(;;){}'], { cwd: '/', stdio: 'ignore' });",
      'setInterval(() => {}, 1000);',
    ].join('\n');
    const parent = start(wt, script);
    await settle();
    const got = measure(wt, 2);
    try {
      expect(got.verdict).toBe('busy');
      expect(got.descendants.length).toBeGreaterThanOrEqual(1);
    } finally {
      for (const d of got.descendants) process.kill(d.pid, 'SIGKILL');
      parent.kill('SIGKILL');
    }
  });

  it('runCli prints the verdict and exits with its code', async () => {
    const wt = tree();
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void logs.push(a.join(' ')));
    expect(runCli([wt, '--window', '1'])).toBe(0);
    expect(logs.join('\n')).toMatch(/FREE/);
    // FREE is advisory: it cannot see writers outside the tree, so it says so.
    expect(logs.join('\n')).toMatch(/advisory: the write scan is a snapshot[\s\S]*never --force/);
    start(wt, 'setInterval(() => {}, 1000)');
    await settle();
    expect(runCli([wt, '--window', '1'])).toBe(3);
    expect(logs.join('\n')).toMatch(/QUIET[\s\S]*holder\s+pid/);
  });

  it('run from inside the tree, the caller is not counted and is named', () => {
    const wt = tree();
    const r = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        join(import.meta.dirname, 'worktree-liveness.ts'),
        wt,
        '--window',
        '1',
      ],
      { cwd: wt, encoding: 'utf8' }
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/FREE/);
    expect(r.stdout).toMatch(/process chain running this check has its cwd here/);
  });

  it.each([
    ['ps fails', 'ps', 'echo "ps: denied" >&2; exit 1'],
    ['ps prints an empty table', 'ps', 'exit 0'],
    ['lsof prints a partial table', 'lsof', 'exit 1'],
    ['lsof crashes', 'lsof', 'exit 2'],
    // MYK9-725: the cwd query succeeds, the system-wide write scan does not.
    [
      'the write scan crashes',
      'lsof',
      `case "$*" in *cwd*) exec '${REAL_LSOF}' "$@";; esac; exit 2`,
    ],
    [
      'the write scan omits the canary (a partial listing)',
      'lsof',
      `case "$*" in *cwd*) exec '${REAL_LSOF}' "$@";; esac; exit 0`,
    ],
  ])('fails closed with exit 2, never FREE, when %s', (_label, bin, body) => {
    const wt = tree();
    const stubs = join(wt, '..', 'stub bin');
    mkdirSync(stubs);
    writeFileSync(join(stubs, bin), `#!/bin/sh\n${body}\n`);
    chmodSync(join(stubs, bin), 0o755);
    const r = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        join(import.meta.dirname, 'worktree-liveness.ts'),
        wt,
        '--window',
        '1',
      ],
      { encoding: 'utf8', env: { ...process.env, PATH: `${stubs}:${process.env.PATH}` } }
    );
    expect(r.status).toBe(2);
    expect(r.stdout).not.toMatch(/FREE/);
  });

  it('fails closed with exit 2 when the write scan outlives --scan-timeout', () => {
    const wt = tree();
    const stubs = join(wt, '..', 'stub bin');
    mkdirSync(stubs);
    writeFileSync(
      join(stubs, 'lsof'),
      `#!/bin/sh\ncase "$*" in *cwd*) exec '${REAL_LSOF}' "$@";; esac\nexec sleep 30\n`
    );
    chmodSync(join(stubs, 'lsof'), 0o755);
    const r = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        join(import.meta.dirname, 'worktree-liveness.ts'),
        wt,
        '--window',
        '1',
        '--scan-timeout',
        '1',
      ],
      { encoding: 'utf8', env: { ...process.env, PATH: `${stubs}:${process.env.PATH}` } }
    );
    expect(r.status).toBe(2);
    expect(r.stdout).not.toMatch(/FREE/);
  });

  it('runCli refuses a missing path or a bad flag with exit 2', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(runCli([])).toBe(2);
    expect(runCli(['/no/such/worktree'])).toBe(2);
    expect(runCli([tree(), '--window', '0'])).toBe(2);
  });
});
