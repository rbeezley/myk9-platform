import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateEnvFile, placeholderKeys } from './vercel-env-placeholder-guard.ts';

const CLEAN = 'VITE_A="abc"\nVITE_B=def\n# VITE_C="[SENSITIVE]"\n';

describe('placeholderKeys', () => {
  it('finds quoted and unquoted placeholders, ignores comments and real values', () => {
    const content = `VITE_Q="[SENSITIVE]"\nVITE_U=[SENSITIVE]\nexport VITE_S='[SENSITIVE]'\nVITE_OK="x [SENSITIVE] y"\n${CLEAN}`;
    expect(placeholderKeys(content)).toEqual(['VITE_Q', 'VITE_U', 'VITE_S']);
  });
});

describe('evaluateEnvFile', () => {
  it('is green for a clean file', () => {
    expect(evaluateEnvFile(CLEAN, '')).toEqual({ code: 0, errors: [], warnings: [] });
  });

  it('ignores placeholders for build-time secrets that are never bundled', () => {
    // The 2026-11-04 production pull wrote 5 placeholders, 3 of them SENTRY_* build secrets.
    const r = evaluateEnvFile(
      'SENTRY_AUTH_TOKEN="[SENSITIVE]"\nSENTRY_ORG="[SENSITIVE]"\nVITE_A="ok"\n',
      ''
    );
    expect(r).toEqual({ code: 0, errors: [], warnings: [] });
  });

  it('is red for a non-allowlisted placeholder, naming the key and no other value', () => {
    const r = evaluateEnvFile(
      'VITE_VAPID_PUBLIC_KEY="[SENSITIVE]"\nVITE_A="secretvalue"\n',
      'VITE_SENTRY_DSN'
    );
    expect(r.code).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('VITE_VAPID_PUBLIC_KEY');
    expect(r.errors.join()).not.toContain('secretvalue');
  });

  it('warns, not fails, for an allowlisted placeholder', () => {
    const r = evaluateEnvFile(
      'VITE_SENTRY_DSN=[SENSITIVE]\n',
      'VITE_SENTRY_DSN, VITE_PUBLIC_SURFACE'
    );
    expect(r.code).toBe(0);
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toContain('VITE_SENTRY_DSN');
    expect(r.warnings[0]).toContain('MYK9-1699');
  });

  it('still fails a non-allowlisted key alongside an allowlisted one', () => {
    const r = evaluateEnvFile(
      'VITE_SENTRY_DSN="[SENSITIVE]"\nVITE_X="[SENSITIVE]"\n',
      'VITE_SENTRY_DSN'
    );
    expect(r.code).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.warnings).toHaveLength(1);
  });

  it('fails closed on a missing file', () => {
    const r = evaluateEnvFile(undefined, 'VITE_SENTRY_DSN');
    expect(r.code).toBe(1);
    expect(r.errors[0]).toContain('missing');
  });
});

describe('CLI', () => {
  const script = join(__dirname, 'vercel-env-placeholder-guard.ts');
  const run = (file: string, allow: string) =>
    spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        script,
        file,
      ],
      { encoding: 'utf8', env: { ...process.env, SENSITIVE_PLACEHOLDER_ALLOWLIST: allow } }
    );

  it('exits 1 on a placeholder, 0 when allowlisted, 1 when the file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-guard-'));
    const file = join(dir, '.env.production.local');
    writeFileSync(file, 'VITE_VAPID_PUBLIC_KEY="[SENSITIVE]"\nVITE_OK="v"\n');
    const red = run(file, '');
    expect(red.status).toBe(1);
    expect(red.stdout).toContain('::error::VITE_VAPID_PUBLIC_KEY');
    const green = run(file, 'VITE_VAPID_PUBLIC_KEY');
    expect(green.status).toBe(0);
    expect(green.stdout).toContain('::warning::VITE_VAPID_PUBLIC_KEY');
    expect(run(join(dir, 'nope'), '').status).toBe(1);
  });
});
