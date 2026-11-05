// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// MYK9-1709: known-answer fixtures for the SC2318 guard (LESSON local-self-reference).
const script = path.resolve(__dirname, 'shellcheck-sc2318.sh');
const dir = mkdtempSync(path.join(tmpdir(), 'sc2318-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(body: string, name: string) {
  const file = path.join(dir, name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}`);
  return spawnSync('bash', [script, file], { encoding: 'utf8' });
}

// The Mac has no shellcheck; CI always does (the runner image ships it, and the
// Quality Checks step installs it if not). Skip locally, never in CI.
const hasShellcheck = spawnSync('shellcheck', ['--version']).status === 0;
const describeIfShellcheck = hasShellcheck || process.env.CI ? describe : describe.skip;

describeIfShellcheck('shellcheck-sc2318.sh', () => {
  it('fails on a local that references a variable declared on the same line', () => {
    const r = run('f() {\n  local s="$1" n=${#s}\n  echo "$n"\n}\n', 'hit.sh');
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('SC2318');
  });

  it('passes when the declaration is split', () => {
    const r = run('f() {\n  local s="$1"\n  local n=${#s}\n  echo "$n"\n}\n', 'clean.sh');
    expect(r.status).toBe(0);
  });

  it('ignores other shellcheck codes', () => {
    const r = run('echo $UNQUOTED\n', 'other.sh');
    expect(r.status).toBe(0);
  });

  it('passes over every tracked script on the current tree', () => {
    const r = spawnSync('bash', [script], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});
