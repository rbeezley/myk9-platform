import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The wrapper is a program, so it gets a behavioural test: a stub `codex` on
 * PATH prints a canned log and we assert the wrapper's exit code and output.
 * Grepping the wrapper's source for the abort phrases would prove someone
 * typed them, not that the wrapper acts on them.
 */
const SCRIPT = resolve(import.meta.dirname, 'codex-review.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function stubCodex(output: string, exitCode = 0): { bin: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'codex-stub-'));
  dirs.push(dir);
  const bin = join(dir, 'codex');
  const canned = join(dir, 'canned.log');
  writeFileSync(canned, output);
  writeFileSync(
    bin,
    `#!/usr/bin/env bash
cat ${JSON.stringify(canned)}
exit ${exitCode}
`
  );
  chmodSync(bin, 0o755);
  return { bin, log: join(dir, 'review.log') };
}

function run(stub: { bin: string; log: string }): { code: number; out: string } {
  try {
    const out = execFileSync('bash', [SCRIPT, 'HEAD'], {
      encoding: 'utf8',
      env: { ...process.env, CODEX_BIN: stub.bin, CODEX_REVIEW_LOG: stub.log },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

describe('codex-review.sh', () => {
  it('exits 2 and says GATE DID NOT RUN on a usage-limit abort, even though codex exited 0', () => {
    const stub = stubCodex(
      [
        'Review the diff below',
        '+  grep for "Review was interrupted" in the diff must not count',
        "ERROR: You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage",
        'Review was interrupted. Please re-run /review and wait for it to complete.',
        'codex',
        'Review was interrupted. Please re-run /review and wait for it to complete.',
      ].join('\n'),
      0
    );
    const r = run(stub);
    expect(r.code).toBe(2);
    expect(r.out).toContain('GATE DID NOT RUN');
    expect(r.out).not.toContain('Review gate: codex reviewed');
  });

  it('does not mistake the diff echo for an abort (anchored grep)', () => {
    const stub = stubCodex(
      [
        '+ echo "Review was interrupted" # quoted inside a diff line',
        'codex',
        'No actionable defects found.',
      ].join('\n')
    );
    const r = run(stub);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Review gate: codex reviewed');
  });

  it('exits 1 with the findings when the review reports any [P*] item', () => {
    const stub = stubCodex(
      [
        'codex',
        'Two problems.',
        '',
        'Full review comments:',
        '',
        '- [P2] Something is wrong — file.ts:10',
        '  detail',
      ].join('\n')
    );
    const r = run(stub);
    expect(r.code).toBe(1);
    expect(r.out).toContain('[P2] Something is wrong');
    expect(r.out).not.toContain('Review gate: codex reviewed');
  });

  it('exits 0 and prints the exact evidence line on a clean verdict', () => {
    const stub = stubCodex(['codex', 'No actionable defects found in the diff.'].join('\n'));
    const r = run(stub);
    expect(r.code).toBe(0);
    // Shape the review-gate checker accepts: two 9-char SHAs, em dash, exact verdict.
    expect(r.out).toMatch(
      /^Review gate: codex reviewed [0-9a-f]{9}\.\.[0-9a-f]{9} — no findings$/m
    );
    expect(readFileSync(stub.log, 'utf8')).toContain('No actionable defects');
  });

  it.each([
    [
      'cli failure with prose in the verdict block',
      'codex\nUnable to complete the review because the connection failed.',
      1,
    ],
    [
      'cli exit 0 but no explicit clean verdict',
      'codex\nUnable to complete the review because the connection failed.',
      0,
    ],
    ['explicit clean verdict but cli exit 1', 'codex\nNo actionable defects found.', 1],
    ['partial output with no findings bullets', 'codex\nReviewing... 3 of 12 files read so far', 0],
    [
      'a sentence that merely CONTAINS the phrase',
      'codex\nThe run stopped before reaching a no actionable verdict.',
      0,
    ],
  ])(
    'exits 2 without evidence on %s — clean is a positive match, not the absence of findings',
    (_, output, exitCode) => {
      // Codex review of #2063, P1: the first wrapper certified any verdict block
      // without a [P*] bullet as clean, including a connection failure.
      const r = run(stubCodex(output, exitCode));
      expect(r.code).toBe(2);
      expect(r.out).not.toContain('Review gate: codex reviewed');
    }
  );

  it.each([
    'No actionable defects found in the diff.',
    'No actionable regressions were identified in the changes.',
    'no actionable issues',
    // Real wording from /tmp/codex-review-2045.log — the noun phrase varies,
    // only the "No actionable" opening is stable (Codex review of #2063, P2).
    'No actionable correctness, security, or data-flow regressions were found. The focused migration contract tests passed.',
  ])('accepts the explicit clean verdict %j', verdict => {
    const r = run(stubCodex(`codex\n${verdict}`));
    expect(r.code).toBe(0);
    expect(r.out).toContain('Review gate: codex reviewed');
  });

  it('exits 2 when there is no verdict block at all', () => {
    const stub = stubCodex('nothing useful here');
    expect(run(stub).code).toBe(2);
  });

  it('always reviews the branch against a base, never a single commit', () => {
    // Wiring assertion on source text is fair here: deleting --base deletes
    // the string. A stub that records its argv would prove the same thing.
    const src = readFileSync(SCRIPT, 'utf8')
      .split('\n')
      .filter(line => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(src).toMatch(/review --base "\$BASE_REF"/);
    expect(src).not.toMatch(/--commit/);
  });
});
