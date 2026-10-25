import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanForPublication } from './publication-scan.ts';

// Synthetic values only; the quote and backslash exercise the JSON-escaped form.
const SECRET = 'sk-synthetic-"handoff"\\value-7Q2';
const ENV = { OPENAI_API_KEY: SECRET, LINEAR_API_KEY: 'lin_api_synthetic_0001', HOME: '/x' };

let staging: string;

beforeEach(() => {
  staging = mkdtempSync(join(tmpdir(), 'publication-scan-'));
  mkdirSync(join(staging, 'nested'), { recursive: true });
  writeFileSync(join(staging, 'review.log'), 'review complete\nverdict: clean\n');
});

afterEach(() => {
  rmSync(staging, { recursive: true, force: true });
});

describe('scanForPublication', () => {
  it('passes a staging directory and excerpts with no secret in them', async () => {
    await expect(
      scanForPublication({ dirs: [staging], texts: ['verdict: clean'], env: ENV })
    ).resolves.toEqual({ ok: true });
  });

  it('blocks a secret in a plain log', async () => {
    writeFileSync(join(staging, 'review.log'), `token used: ${SECRET}\n`);
    const result = await scanForPublication({ dirs: [staging], texts: [], env: ENV });
    expect(result).toMatchObject({ ok: false, locations: ['review.log'] });
  });

  it('blocks a JSON-escaped secret in a nested report', async () => {
    writeFileSync(join(staging, 'nested', 'report.json'), JSON.stringify({ stderr: SECRET }));
    const result = await scanForPublication({ dirs: [staging], texts: [], env: ENV });
    expect(result).toMatchObject({ ok: false, locations: ['nested/report.json'] });
  });

  it('blocks a secret in verdict text bound for a comment', async () => {
    const result = await scanForPublication({
      dirs: [],
      texts: ['verdict: clean', 'Linear key lin_api_synthetic_0001 leaked'],
      env: ENV,
    });
    expect(result).toMatchObject({ ok: false, locations: ['text[1]'] });
  });

  it('blocks when the scanner cannot run, instead of publishing unscanned', async () => {
    const result = await scanForPublication({
      dirs: [join(staging, 'does-not-exist')],
      texts: [],
      env: ENV,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/scanner error/);
  });

  it('never puts a secret value into its diagnostics', async () => {
    writeFileSync(join(staging, 'review.log'), SECRET);
    const results = [
      await scanForPublication({ dirs: [staging], texts: [SECRET], env: ENV }),
      await scanForPublication({ dirs: [join(staging, SECRET)], texts: [], env: ENV }),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(SECRET);
      expect(serialized).not.toContain(JSON.stringify(SECRET).slice(1, -1));
    }
  });

  it('scrubs a secret out of a finding location (a file named after the key)', async () => {
    writeFileSync(join(staging, 'nested', `${SECRET}.log`), SECRET);
    const result = await scanForPublication({ dirs: [staging], texts: [], env: ENV });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.locations).toHaveLength(1);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(JSON.stringify(SECRET).slice(1, -1));
  });

  it('blocks when a nested directory cannot be listed, instead of skipping it', async () => {
    const result = await scanForPublication({
      dirs: [staging],
      texts: [],
      env: ENV,
      readdir: async path => {
        if (path === join(staging, 'nested')) {
          throw Object.assign(new Error(`EACCES: permission denied, scandir '${path}'`), {
            code: 'EACCES',
          });
        }
        return (await import('node:fs/promises')).readdir(path, { withFileTypes: true });
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/scanner error.*EACCES/);
  });

  // Root ignores mode 000, so this real-permission case only runs as a normal user (the Mac).
  it.skipIf(process.getuid?.() === 0)(
    'blocks a secret-bearing nested directory with mode 000',
    async () => {
      writeFileSync(join(staging, 'nested', 'hidden.log'), SECRET);
      chmodSync(join(staging, 'nested'), 0o000);
      try {
        const result = await scanForPublication({ dirs: [staging], texts: [], env: ENV });
        expect(result.ok).toBe(false);
      } finally {
        chmodSync(join(staging, 'nested'), 0o755);
      }
    }
  );
});
