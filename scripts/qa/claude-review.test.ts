import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The Claude half of the review gate gets the same behavioural treatment as the
 * Codex half: a stub `claude` prints a canned log and we assert the wrapper's
 * exit code and what reached the PR. `claude -p` exits 0 on an interrupted run,
 * a usage limit and on findings alike, so every one of these is a case where
 * the exit code and the verdict disagree.
 */
const SCRIPT = resolve(import.meta.dirname, 'claude-review.sh');
const CODEX_SCRIPT = resolve(import.meta.dirname, 'codex-review.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function stubClaude(output: string, exitCode = 0): { bin: string; log: string; args: string } {
  const dir = mkdtempSync(join(tmpdir(), 'claude-stub-'));
  dirs.push(dir);
  const bin = join(dir, 'claude');
  const canned = join(dir, 'canned.log');
  const args = join(dir, 'args.log');
  writeFileSync(canned, output);
  writeFileSync(
    bin,
    `#!/usr/bin/env bash
printf '%s\\n' "$@" > '${args}'
cat ${JSON.stringify(canned)}
exit ${exitCode}
`
  );
  chmodSync(bin, 0o755);
  return { bin, log: join(dir, 'review.log'), args };
}

/** The local HEAD the wrapper will bind its evidence to. */
const LOCAL_HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

function stubGh(opts: { commentExit?: number; prior?: string; prHead?: string } = {}): {
  bin: string;
  calls: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'gh-stub-'));
  dirs.push(dir);
  const calls = join(dir, 'calls.log');
  const prior = join(dir, 'prior.txt');
  const bin = join(dir, 'gh');
  writeFileSync(prior, opts.prior ?? '');
  writeFileSync(
    bin,
    `#!/usr/bin/env bash
printf '%s\\n' "$@" >> '${calls}'
printf -- '---\\n' >> '${calls}'
case "$*" in
  *headRefOid*) echo '${opts.prHead ?? LOCAL_HEAD}' ;;
  *comments*) cat '${prior}' ;;
  'pr view --json number'*) echo 7 ;;
  'pr comment'*) exit ${opts.commentExit ?? 0} ;;
esac
`
  );
  chmodSync(bin, 0o755);
  return { bin, calls };
}

/**
 * Every `--body` the stub `gh` was handed, in order. The wrapper also READS the
 * PR (number, head SHA, prior comments), so "nothing was posted" is an empty
 * body list, not an absent calls file.
 */
function bodies(callsPath: string): string[] {
  if (!existsSync(callsPath)) return [];
  return readFileSync(callsPath, 'utf8')
    .split('\n---\n')
    .filter(Boolean)
    .flatMap(call => {
      const lines = call.split('\n');
      const i = lines.indexOf('--body');
      return i < 0 ? [] : [lines.slice(i + 1).join('\n')];
    });
}

function run(
  stub: { bin: string; log: string },
  gh: { bin: string },
  args: string[] = ['--post', '7']
): { code: number; out: string } {
  try {
    const out = execFileSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_BIN: stub.bin, CLAUDE_REVIEW_LOG: stub.log, GH_BIN: gh.bin },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

describe('claude-review.sh', () => {
  it('sends /code-review plus the SAME verdict contract codex-review.sh sends', () => {
    // Extracted, not copied: two reviewers judged by two paragraphs is how a
    // gate quietly starts accepting different things from each harness.
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh();
    expect(run(stub, gh, ['7']).code).toBe(0);
    const args = readFileSync(stub.args, 'utf8').trimEnd().split('\n');
    expect(args[0]).toBe('-p');
    const prompt = args.slice(1).join('\n');
    expect(prompt.split('\n')[0]).toBe('/code-review 7');
    const contract = readFileSync(CODEX_SCRIPT, 'utf8').match(/^REVIEW_INSTRUCTIONS='(.*)'$/m)?.[1];
    expect(contract, 'codex-review.sh must expose REVIEW_INSTRUCTIONS').toBeTruthy();
    expect(contract!.length).toBeGreaterThan(200);
    expect(prompt).toContain(contract!);
  });

  it('--post on a clean review posts evidence naming claude as the reviewer', () => {
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh();
    expect(run(stub, gh).code).toBe(0);
    const posted = bodies(gh.calls);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatch(
      /^Review gate: claude reviewed [0-9a-f]{9}\.\.[0-9a-f]{9} — no findings\nlog sha256: [0-9a-f]{64}\n/
    );
  });

  it('--post on findings posts a NON-evidence comment and exits 1', () => {
    const stub = stubClaude('Two problems.\n\n- [P1] Something is broken');
    const gh = stubGh();
    const r = run(stub, gh);
    expect(r.code).toBe(1);
    const posted = bodies(gh.calls);
    expect(posted[0].split('\n')[0]).toMatch(
      /^Claude findings for [0-9a-f]{9} \(not gate evidence\):$/
    );
    expect(posted[0]).toContain('[P1] Something is broken');
  });

  it('counts N from its own earlier findings comments', () => {
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh({
      prior:
        'Claude findings for abc123456 (not gate evidence):\n\n- [P1] one\n- [P2] two\n- [P3] three\n',
    });
    expect(run(stub, gh).code).toBe(0);
    expect(bodies(gh.calls)[0]).toMatch(/— 3 findings, all addressed\n/);
  });

  it('exits 2 when the review was clean but the evidence did NOT get posted', () => {
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh({ commentExit: 1 });
    const r = run(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('NOT posted');
  });

  it('refuses to review when the PR head is not the local HEAD', () => {
    // `/code-review <pr>` reads the REMOTE head; the evidence names local HEAD.
    // With an unpushed commit a clean review would attest to unreviewed code.
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh({ prHead: '0'.repeat(40) });
    const r = run(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('local HEAD');
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('exits 2 when the findings comment could not be posted', () => {
    // The next clean run counts N from these comments, so a dropped one makes
    // the evidence say "no findings" for a head that had them.
    const stub = stubClaude('- [P1] Something is broken\n');
    const gh = stubGh({ commentExit: 1 });
    const r = run(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('NOT posted');
  });

  it.each([
    ['a usage-limit abort that still exits 0', "ERROR: You've hit your usage limit\n", 0],
    [
      'a sentence that opens "No actionable" but asserts no VERDICT is available',
      'No actionable verdict is available; only one file has been inspected.\n',
      0,
    ],
    ['an empty log', '', 0],
    ['prose that is neither findings nor a clean verdict', 'The change looks fine to me.\n', 0],
    [
      'a clean sentence about an incomplete review',
      'The review did not run. No actionable defects found.\n',
      0,
    ],
    ['a clean verdict with a non-zero cli exit', 'No actionable defects found.\n', 1],
    [
      'a clean sentence only in a later paragraph',
      'Summary of changes.\n\nNo actionable defects found.\n',
      0,
    ],
  ])('exits 2 without posting on %s', (_label, output, exitCode) => {
    const stub = stubClaude(output, exitCode);
    const gh = stubGh();
    const r = run(stub, gh);
    expect(r.code).toBe(2);
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('without --post it writes nothing to the PR', () => {
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh();
    const r = run(stub, gh, ['7']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('post-review-gate.sh');
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('refuses to review at all when the contract cannot be read', () => {
    // A wrapper that silently reviewed without the contract paragraph would
    // accept "looks good to me" as a verdict, which is the whole failure mode.
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh();
    const dir = mkdtempSync(join(tmpdir(), 'no-contract-'));
    dirs.push(dir);
    const copy = join(dir, 'claude-review.sh');
    writeFileSync(copy, readFileSync(SCRIPT, 'utf8'));
    writeFileSync(
      join(dir, 'review-verdict.sh'),
      readFileSync(resolve(import.meta.dirname, 'review-verdict.sh'), 'utf8')
    );
    writeFileSync(join(dir, 'codex-review.sh'), '#!/usr/bin/env bash\necho hi\n');
    let code = 0;
    let out = '';
    try {
      out = execFileSync('bash', [copy, '7'], {
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_BIN: stub.bin, CLAUDE_REVIEW_LOG: stub.log, GH_BIN: gh.bin },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const e = error as { status: number; stdout: string; stderr: string };
      code = e.status;
      out = `${e.stdout}${e.stderr}`;
    }
    expect(code).toBe(2);
    expect(out).toContain('verdict contract');
  });
});
