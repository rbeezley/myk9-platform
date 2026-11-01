import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const script = resolve(process.cwd(), 'scripts/ci/reserve-supabase-ports.sh');
const realConfig = resolve(process.cwd(), 'supabase/config.toml');
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

/** A sysctl stub: `-n` prints CURRENT, `-w` records the assignment. */
function run(config: string, current = '') {
  const dir = mkdtempSync(join(tmpdir(), 'reserve-ports-'));
  dirs.push(dir);
  const configPath = join(dir, 'config.toml');
  const written = join(dir, 'written');
  const stub = join(dir, 'sysctl');
  writeFileSync(configPath, config);
  writeFileSync(
    stub,
    `#!/usr/bin/env bash\nif [[ "$1" == "-n" ]]; then echo "${current}"; else echo "$2" > "${written}"; fi\n`
  );
  chmodSync(stub, 0o755);
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_CONFIG: configPath, SYSCTL_BIN: stub, SUDO: '' },
  });
  let assignment: string | null = null;
  try {
    assignment = readFileSync(written, 'utf8').trim();
  } catch {
    assignment = null;
  }
  return { ...result, assignment };
}

describe('reserve-supabase-ports.sh', () => {
  it('reserves 54320-54329 for the repo config', () => {
    const result = run(readFileSync(realConfig, 'utf8'));
    expect(result.status).toBe(0);
    expect(result.assignment).toBe('net.ipv4.ip_local_reserved_ports=54320-54329');
  });

  it('appends to an existing reserved list instead of replacing it', () => {
    const result = run('[db]\nport = 54322\nshadow_port = 54320\n', '22,8000-8010');
    expect(result.status).toBe(0);
    expect(result.assignment).toBe('net.ipv4.ip_local_reserved_ports=22,8000-8010,54320-54329');
  });

  it('does nothing when the range is already reserved', () => {
    const result = run('[db]\nport = 54322\n', '22,54320-54329');
    expect(result.status).toBe(0);
    expect(result.assignment).toBeNull();
  });

  it('fails loudly when a configured port is outside the reserved range', () => {
    const result = run('[db]\nport = 54322\n[studio]\nport = 54400\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('54400');
    expect(result.stderr).toContain('outside the reserved range');
    expect(result.assignment).toBeNull();
  });

  it('ignores commented ports and catches *_port keys', () => {
    expect(run('[db]\nport = 54322\n# port = 9999\n').status).toBe(0);
    const bad = run('[db]\nport = 54322\nshadow_port = 60000 # odd\n');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('60000');
  });

  it('fails when the config holds no ports', () => {
    expect(run('[auth]\nenabled = true\n').status).toBe(1);
  });
});

describe('workflows that start local Supabase', () => {
  const START = /qa:isolated-e2e:prepare|supabase start/;
  const files = [
    'batch3-verification',
    'show-day-verification',
    'nightly-e2e',
    'nightly-health',
    'ci',
  ];

  it.each(files)('%s reserves the ports before each stack start, in the same job', name => {
    const text = readFileSync(resolve(process.cwd(), `.github/workflows/${name}.yml`), 'utf8');
    const jobsBlock = text.slice(text.indexOf('\njobs:'));
    const jobs = jobsBlock.split(/\n  (?=[A-Za-z0-9_-]+:\n)/).slice(1);
    let starts = 0;
    for (const job of jobs) {
      const lines = job.split('\n');
      const startAt = lines.findIndex(l => /^\s+run:/.test(l) && START.test(l));
      if (startAt === -1) continue;
      starts += 1;
      const reserveAt = lines.findIndex(l =>
        l.includes('bash scripts/ci/reserve-supabase-ports.sh')
      );
      expect(reserveAt, `${name}: ${lines[0]}`).toBeGreaterThan(-1);
      expect(reserveAt, `${name}: ${lines[0]}`).toBeLessThan(startAt);
    }
    expect(starts).toBeGreaterThan(0);
  });
});
