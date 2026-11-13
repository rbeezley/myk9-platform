import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseGateComments } from './review-gate';

/**
 * The coverage record on a clean codex evidence comment (MYK9-1603). The
 * poster writes `Coverage: complete from <sha>` as line 2 only when the codex
 * wrapper supplies REVIEW_COVERAGE_FROM for a finished review; line 1 keeps the
 * grammar review-gate.ts parses.
 */
const SCRIPT = resolve(import.meta.dirname, 'post-review-gate.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function stubGh(): { bin: string; calls: string } {
  const dir = tmp('gh-stub-');
  const calls = join(dir, 'calls.log');
  const bin = join(dir, 'gh');
  writeFileSync(
    bin,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> '${calls}'\nprintf -- '---\\n' >> '${calls}'\n`
  );
  chmodSync(bin, 0o755);
  return { bin, calls };
}

const CLEAN = 'codex\nNo actionable defects found.\n';
const FINDING = 'codex\n- [P2] src/a.ts:3 — a defect.\n';

function post(
  args: string[],
  logText: string,
  env: Record<string, string>
): { code: number; out: string; body: string } {
  const gh = stubGh();
  const log = join(tmp('review-log-'), 'review.log');
  writeFileSync(log, logText);
  let code = 0;
  let out = '';
  try {
    out = execFileSync('bash', [SCRIPT, ...args.map(a => (a === 'LOG' ? log : a))], {
      encoding: 'utf8',
      env: { ...process.env, ...env, GH_BIN: gh.bin },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    code = err.status;
    out = `${err.stdout}${err.stderr}`;
  }
  let body = '';
  try {
    body = readFileSync(gh.calls, 'utf8').split('--body\n')[1]?.split('\n---')[0] ?? '';
  } catch {
    // nothing posted
  }
  return { code, out, body };
}

const CLEAN_ARGS = ['42', 'codex', '0a2020c7a', '5af9af158', 'no findings', 'LOG'];

describe('post-review-gate.sh coverage record (MYK9-1603)', () => {
  it('writes the coverage line as line 2 when supplied, leaving line 1 and the hash intact', () => {
    const r = post(CLEAN_ARGS, CLEAN, { REVIEW_COVERAGE_FROM: '0a2020c7a' });
    expect(r.code).toBe(0);
    const lines = r.body.split('\n');
    expect(lines[0]).toBe('Review gate: codex reviewed 0a2020c7a..5af9af158 — no findings');
    expect(lines[1]).toBe('Coverage: complete from 0a2020c7a');
    expect(lines[2]).toMatch(/^log sha256: [0-9a-f]{64}$/);
  });

  it('writes nothing extra when the variable is absent or empty (today shape)', () => {
    for (const env of [{}, { REVIEW_COVERAGE_FROM: '' }] as Record<string, string>[]) {
      const lines = post(CLEAN_ARGS, CLEAN, env).body.split('\n');
      expect(lines[1]).toMatch(/^log sha256: /);
      expect(lines.join('\n')).not.toContain('Coverage:');
    }
  });

  it('review-gate.ts still parses the posted comment as codex evidence', () => {
    const r = post(CLEAN_ARGS, CLEAN, { REVIEW_COVERAGE_FROM: '0a2020c7a' });
    const [evidence] = parseGateComments([
      { body: r.body, authorAssociation: 'OWNER', createdAt: '2026-11-01T00:00:00Z' },
    ]);
    expect(evidence?.reviewer).toBe('codex');
    expect(evidence?.verdict).toBe('no findings');
  });

  it.each([
    ['claude', 'no findings'],
    ['none', 'low-risk paths, CI green'],
  ])('the %s tier ignores the variable and never writes a coverage line', (reviewer, verdict) => {
    const r = post(['42', reviewer, '0a2020c7a', '5af9af158', verdict, 'LOG'], CLEAN, {
      REVIEW_COVERAGE_FROM: '0a2020c7a',
    });
    expect(r.code).toBe(0);
    expect(r.body).not.toContain('Coverage:');
  });

  it('the adversarial and owner tiers never write a coverage line', () => {
    const adv = post(
      ['42', 'adversarial', '0a2020c7a', '5af9af158', '2 lenses, all findings addressed', 'LOG'],
      CLEAN,
      { REVIEW_COVERAGE_FROM: '0a2020c7a', REVIEW_LENSES: 'correctness\nsecurity' }
    );
    expect(adv.code).toBe(0);
    expect(adv.body).not.toContain('Coverage:');
    const owner = post(
      ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', 'LOG'],
      '',
      {
        REVIEW_COVERAGE_FROM: '0a2020c7a',
        OVERRIDE_REASON: 'Codex unavailable — usage limit',
        DEFERRED_REVIEW: 'MYK9-1',
      }
    );
    expect(owner.code).toBe(0);
    expect(owner.body).not.toContain('Coverage:');
  });

  it('a withdrawal never carries a coverage line', () => {
    const r = post(
      ['--withdraw', '42', 'codex', '0a2020c7a', '5af9af158', '1 findings, not addressed', 'LOG'],
      FINDING,
      { REVIEW_COVERAGE_FROM: '0a2020c7a' }
    );
    expect(r.code).toBe(0);
    expect(r.body).not.toContain('Coverage:');
  });

  it('refuses a coverage value that is not a hex sha, posting nothing', () => {
    for (const bad of ['main', 'abc', 'zzzzzzzzz', `${'a'.repeat(41)}`]) {
      const r = post(CLEAN_ARGS, CLEAN, { REVIEW_COVERAGE_FROM: bad });
      expect(r.code).toBe(2);
      expect(r.body).toBe('');
    }
  });

  it('an unfinished review is refused outright, so no coverage line can reach the PR', () => {
    const r = post(CLEAN_ARGS, `${CLEAN}Review was interrupted\n`, {
      REVIEW_COVERAGE_FROM: '0a2020c7a',
    });
    expect(r.code).toBe(2);
    expect(r.body).toBe('');
  });
});

/**
 * MYK9-1787: the poster asks the phone-width walk before any clean post. The
 * stub stands in for `qa:phone-walk --pr <n>` and records how it was called.
 */
function stubWalk(exit: number): { bin: string; calls: string } {
  const dir = tmp('walk-stub-');
  const calls = join(dir, 'calls.log');
  const bin = join(dir, 'walk');
  writeFileSync(bin, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${calls}'\nexit ${exit}\n`);
  chmodSync(bin, 0o755);
  return { bin, calls };
}
const walkEnv = (walk: { bin: string }) => ({
  PHONE_WALK_BIN: walk.bin,
  PHONE_WALK_WAIT_SECONDS: '0',
});

describe('post-review-gate.sh phone-width walk (MYK9-1787)', () => {
  it('posts when the walk is green or not required, asking about this PR', () => {
    const walk = stubWalk(0);
    const r = post(CLEAN_ARGS, CLEAN, walkEnv(walk));
    expect(r.code).toBe(0);
    expect(r.body).toContain('Review gate: codex reviewed');
    expect(readFileSync(walk.calls, 'utf8')).toBe('--pr 42\n');
  });

  it.each([1, 2, 3])('posts nothing when the walk exits %i', exit => {
    const r = post(CLEAN_ARGS, CLEAN, walkEnv(stubWalk(exit)));
    expect(r.code).toBe(2);
    expect(r.out).toContain(`exited ${exit}`);
    expect(r.body).toBe('');
  });

  it('holds the none tier to the walk too, which has no review to wait behind', () => {
    const args = ['42', 'none', '0a2020c7a', '5af9af158', 'low-risk paths, CI green', '/dev/null'];
    expect(post(args, '', walkEnv(stubWalk(0))).code).toBe(0);
    const red = post(args, '', walkEnv(stubWalk(1)));
    expect(red.code).toBe(2);
    expect(red.body).toBe('');
  });

  it('never asks the walk before a withdrawal', () => {
    const walk = stubWalk(1);
    const args = [
      '--withdraw',
      '42',
      'codex',
      '0a2020c7a',
      '5af9af158',
      '1 findings, not addressed',
      'LOG',
    ];
    const r = post(args, FINDING, walkEnv(walk));
    expect(r.code).toBe(0);
    expect(r.body).toContain('1 findings, not addressed');
    expect(() => readFileSync(walk.calls, 'utf8')).toThrow();
  });
});
