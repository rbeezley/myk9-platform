import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The poster is the ONLY writer of `Review gate:` evidence comments, so it gets
 * a behavioural test with a stub `gh`: we assert what it posts and, more
 * importantly, what it refuses to post. Grepping its source for the guard
 * phrases would prove someone typed them, not that they bite.
 */
const SCRIPT = resolve(import.meta.dirname, 'post-review-gate.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function stubGh(): { bin: string; calls: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gh-stub-'));
  dirs.push(dir);
  const calls = join(dir, 'calls.log');
  const bin = join(dir, 'gh');
  writeFileSync(
    bin,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> '${calls}'\nprintf -- '---\\n' >> '${calls}'\n`
  );
  chmodSync(bin, 0o755);
  return { bin, calls };
}
function logFile(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'review-log-'));
  dirs.push(dir);
  const p = join(dir, 'review.log');
  writeFileSync(p, text);
  return p;
}
function run(args: string[], gh: string): { code: number; out: string } {
  try {
    return {
      code: 0,
      out: execFileSync('bash', [SCRIPT, ...args], {
        encoding: 'utf8',
        env: { ...process.env, GH_BIN: gh },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

describe('post-review-gate.sh', () => {
  it('posts the evidence line first, then the log hash, then the verdict block', () => {
    const gh = stubGh();
    const log = logFile('codex\nNo actionable defects found.\n');
    expect(run(['42', 'codex', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin).code).toBe(0);
    const calls = readFileSync(gh.calls, 'utf8');
    expect(calls).toMatch(/^pr\ncomment\n42\n--body\n/);
    const body = calls.split('--body\n')[1]!.split('\n---')[0]!;
    const lines = body.split('\n');
    expect(lines[0]).toBe('Review gate: codex reviewed 0a2020c7a..5af9af158 — no findings');
    expect(lines[1]).toMatch(/^log sha256: [0-9a-f]{64}$/);
    expect(body).toContain('No actionable defects found.');
  });

  it.each(['no blocking findings', '1 finding(s), all addressed', 'no findings yet'])(
    'refuses %j (rejected by review-gate.ts CLEAN_VERDICT) and posts nothing',
    verdict => {
      const gh = stubGh();
      const log = logFile('codex\nNo actionable defects found.\n');
      const r = run(['42', 'codex', '0a2020c7a', '5af9af158', verdict, log], gh.bin);
      expect(r.code).toBe(2);
      expect(r.out).toContain('verdict');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    }
  );

  it('accepts exactly what review-gate.ts accepts (grammar is shared, not copied)', () => {
    const gh = stubGh();
    const log = logFile('codex\nNo actionable defects found on the re-run.\n');
    expect(
      run(['42', 'claude', '0a2020c7a', '5af9af158', '2 findings, all fixed', log], gh.bin).code
    ).toBe(0);
  });

  it('refuses "N findings, all addressed" over a log that still carries findings or lacks the contract sentence', () => {
    for (const text of ['codex\n- [P1] Something is broken\n', 'Both findings were addressed.\n']) {
      const gh = stubGh();
      const log = logFile(text);
      const r = run(
        ['42', 'codex', '0a2020c7a', '5af9af158', '2 findings, all addressed', log],
        gh.bin
      );
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/log does not support/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    }
  });

  it('refuses an empty log', () => {
    const gh = stubGh();
    const log = logFile('');
    expect(
      run(['42', 'claude', '0a2020c7a', '5af9af158', '2 findings, all addressed', log], gh.bin).code
    ).toBe(2);
  });

  it.each([
    'codex\nUnable to complete the review because the connection failed.\n',
    "ERROR: You've hit your usage limit\nReview was interrupted\n",
    'codex\n- [P1] Something is broken\n',
    'No findings yet; only the workflow file has been inspected.\n',
    'No issues found in this diff.\n',
    'Summary of changes.\n\nNo actionable defects found.\n',
  ])(
    'refuses "no findings" over a log that did not complete or still carries findings: %j',
    text => {
      const gh = stubGh();
      const log = logFile(text);
      const r = run(['42', 'codex', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin);
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/log does not support/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    }
  );

  it('accepts "no findings" only when the first paragraph carries the contract sentence', () => {
    const gh = stubGh();
    for (const text of [
      'codex\nNo actionable defects found.\n',
      'No actionable correctness, security, or data-flow regressions were found. Tests pass.\n',
      'The change is small. No actionable issues found.\n',
    ]) {
      const log = logFile(text);
      expect(run(['42', 'claude', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin).code).toBe(
        0
      );
    }
  });

  it('reads a marker-less (claude -p) log in full, so a long clean review keeps its opening sentence', () => {
    const gh = stubGh();
    const long = `No actionable defects found.\n\n${Array.from({ length: 60 }, (_, i) => `- checked file ${i}`).join('\n')}\n`;
    const log = logFile(long);
    expect(run(['42', 'claude', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin).code).toBe(
      0
    );
    expect(readFileSync(gh.calls, 'utf8')).toContain('checked file 59');
  });
});
