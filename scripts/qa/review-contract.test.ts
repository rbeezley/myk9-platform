import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * One review contract for every reviewer (MYK9-1613). The Codex wrapper, the
 * Claude wrapper and the adversarial lenses all read the same paragraph, and
 * the shared verdict rules decide "blocks" identically for each: a capped
 * `[unlikely P3]` never blocks, a P0/P1 never hides behind a not-this-round tag.
 * Behavioural: the scripts run with stub `gh`/`codex`, never grepped.
 */
const HERE = import.meta.dirname;
const CONTRACT_SCRIPT = resolve(HERE, 'review-contract.sh');
const POSTER = resolve(HERE, 'post-review-gate.sh');
const CODEX_SCRIPT = resolve(HERE, 'codex-review.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function exec(file: string, args: string[], env: Record<string, string> = {}) {
  try {
    const out = execFileSync('bash', [file, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

function stubGh(): { bin: string; calls: string } {
  const dir = tmp('gh-stub-');
  const calls = join(dir, 'calls.log');
  const bin = join(dir, 'gh');
  writeFileSync(bin, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> '${calls}'\n`);
  chmodSync(bin, 0o755);
  return { bin, calls };
}

function logFile(text: string): string {
  const p = join(tmp('review-log-'), 'review.log');
  writeFileSync(p, text);
  return p;
}

const LENSES = { REVIEW_LENSES: 'correctness\ndata flow' };
const ADVERSARIAL = '2 lenses, all findings addressed';
const postAdversarial = (log: string) => {
  const gh = stubGh();
  const r = exec(POSTER, ['42', 'adversarial', 'abc1234', 'def5678', ADVERSARIAL, logFile(log)], {
    ...LENSES,
    GH_BIN: gh.bin,
  });
  return { ...r, gh };
};

describe('review-contract.sh', () => {
  it('prints exactly the REVIEW_INSTRUCTIONS paragraph codex-review.sh sends', () => {
    const r = exec(CONTRACT_SCRIPT, []);
    expect(r.code).toBe(0);
    const line = readFileSync(CODEX_SCRIPT, 'utf8').match(/^REVIEW_INSTRUCTIONS='(.*)'$/m)?.[1];
    expect(line).toBeTruthy();
    expect(r.out.trimEnd()).toBe(line);
  });

  it('carries the likelihood cap and the non-blocking tag, so every reviewer gets them', () => {
    const { out } = exec(CONTRACT_SCRIPT, []);
    expect(out).toContain('realistic trigger');
    expect(out).toContain('is P3 at most');
    expect(out).toContain('- [unlikely P3]');
    expect(out).toContain('No actionable defects found.');
  });

  it('exits 2 when the contract cannot be read', () => {
    const dir = tmp('no-contract-');
    const copy = join(dir, 'review-contract.sh');
    writeFileSync(copy, readFileSync(CONTRACT_SCRIPT, 'utf8'));
    writeFileSync(join(dir, 'codex-review.sh'), '#!/usr/bin/env bash\n');
    expect(exec(copy, []).code).toBe(2);
  });
});

describe('shared verdict rules for an adversarial lens log (known answers)', () => {
  it('a log whose only bullets are [unlikely P3] posts as clean', () => {
    const r = postAdversarial(
      [
        'No actionable defects found.',
        '',
        'Not actionable this round',
        '- [unlikely P3] src/sync.ts:40 — a disconnect inside one request; Retry recovers.',
      ].join('\n')
    );
    expect(r.code).toBe(0);
    expect(readFileSync(r.gh.calls, 'utf8')).toContain('Review gate: adversarial reviewed');
  });

  it('an earlier-round P2 does not block either', () => {
    const r = postAdversarial(
      'No actionable defects found.\n\n- [earlier-round P2] src/card.tsx:12 — truncates at 320px.\n'
    );
    expect(r.code).toBe(0);
  });

  for (const tag of ['unlikely P1', 'earlier-round P1', 'unlikely P0', 'earlier-round P0']) {
    it(`a [${tag}] bullet is a finding: the poster refuses "all findings addressed"`, () => {
      const r = postAdversarial(
        `No actionable defects found.\n\n- [${tag}] src/score.ts:9 — loses a score.\n`
      );
      expect(r.code).toBe(2);
      expect(() => readFileSync(r.gh.calls, 'utf8')).toThrow();
    });
  }

  it('a plain [P3] still blocks: the cap is opt-in by tag, not by priority', () => {
    const r = postAdversarial('No actionable defects found.\n\n- [P3] src/a.ts:1 — a defect.\n');
    expect(r.code).toBe(2);
  });
});
