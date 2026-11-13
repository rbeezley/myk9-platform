import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCodexArgs, realLaunchWorker } from './worker';

const RECORD = '/Users/someone/.codex/automations/nightly-commit-review/runs/2026-11-13-x.json';
const RUNS_DIR = '/Users/someone/.codex/automations/nightly-commit-review/runs';

/** The `-c key=value` pairs in an argv, as a map (later wins, as in Codex). */
function configPairs(args: string[]): Map<string, string> {
  const out = new Map<string, string>();
  args.forEach((a, i) => {
    const pair = args[i + 1];
    if (a !== '-c' || pair === undefined) return;
    const eq = pair.indexOf('=');
    out.set(pair.slice(0, eq), pair.slice(eq + 1));
  });
  return out;
}

describe('worker sandbox (MYK9-1883: the 2026-11-13 run blocked at 0/63)', () => {
  it.each([
    ['a fresh worker', undefined],
    ['a resumed worker', 'session-1'],
  ])('%s can write the run record and escalate under auto-review', (_label, sessionId) => {
    const args = buildCodexArgs(
      { recordPath: RECORD, remainingShas: ['a'], publicationOnly: false, sessionId },
      'PROMPT'
    );
    const cfg = configPairs(args);
    expect(cfg.get('sandbox_mode')).toBe('"workspace-write"');
    expect(cfg.get('sandbox_workspace_write.writable_roots')).toBe(`[${JSON.stringify(RUNS_DIR)}]`);
    expect(cfg.get('approval_policy')).toBe('"on-request"');
    expect(cfg.get('approvals_reviewer')).toBe('"auto_review"');
    expect(args.at(-1)).toBe('PROMPT');
    if (sessionId) expect(args.slice(0, 2)).toEqual(['exec', 'resume']);
    if (sessionId) expect(args.at(-2)).toBe(sessionId);
  });

  it('never uses flags that `codex exec resume` rejects', () => {
    const args = buildCodexArgs(
      { recordPath: RECORD, remainingShas: [], publicationOnly: true, sessionId: 's' },
      'P'
    );
    expect(args).not.toContain('--sandbox');
    expect(args).not.toContain('-s');
    expect(args).not.toContain('--add-dir');
  });

  it('keeps a path with spaces as one quoted TOML string', () => {
    const args = buildCodexArgs(
      { recordPath: '/a b/runs/r.json', remainingShas: [], publicationOnly: false },
      'P'
    );
    expect(args).toContain('sandbox_workspace_write.writable_roots=["/a b/runs"]');
  });

  it('lets COMMIT_REVIEW_CODEX_ARGS override a default by coming last', () => {
    const args = buildCodexArgs(
      { recordPath: RECORD, remainingShas: [], publicationOnly: false },
      'P',
      ['-c', 'approval_policy="never"']
    );
    expect(configPairs(args).get('approval_policy')).toBe('"never"');
  });

  it('runs the checkpoint CLI without the tsx CLI, whose IPC socket the sandbox denies', () => {
    // `tsx <file>` listens on a local socket; in the Codex sandbox that is `listen EPERM`
    // and every `mark-reviewed` failed. `node --import tsx` needs no socket.
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['qa:commit-review:validate']).toMatch(/^node --import tsx /);
  });
});

describe('realLaunchWorker passes the sandbox flags to codex', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'worker-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('spawns codex with the writable record directory', async () => {
    const bin = join(dir, 'fake-codex');
    const argvFile = join(dir, 'argv.json');
    writeFileSync(
      bin,
      `#!/usr/bin/env node
require('fs').writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));
console.log(JSON.stringify({ type: 'thread.started', thread_id: 't1' }));
`
    );
    chmodSync(bin, 0o755);
    const instr = join(dir, 'instructions.md');
    writeFileSync(instr, 'review');
    const record = join(dir, 'runs', 'r.json');
    const res = await realLaunchWorker({ repoDir: dir, instructionsFile: instr, codexBin: bin })({
      recordPath: record,
      remainingShas: ['abc'],
      publicationOnly: false,
    });
    expect(res.exitCode).toBe(0);
    const argv = JSON.parse(readFileSync(argvFile, 'utf8')) as string[];
    expect(configPairs(argv).get('sandbox_workspace_write.writable_roots')).toBe(
      `[${JSON.stringify(join(dir, 'runs'))}]`
    );
  });
});
