/** @vitest-environment node */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrubArtifactSecrets } from '../src/utils/scrubArtifactSecrets';
import { run } from './verify-artifact-secrets';

const SECRET = 'FakeSecretForTest-91a7';
const ENV = { E2E_FAKE_PASSWORD: SECRET } as NodeJS.ProcessEnv;
const dirs: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'verify-secrets-'));
  dirs.push(dir);
  return dir;
}

function reportHtml(entries: Record<string, string>): string {
  const zip = zipSync(
    Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]))
  );
  return `<html><template id="playwrightReportBase64">data:application/zip;base64,${Buffer.from(zip).toString('base64')}</template></html>`;
}

async function capture(argv: string[]): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...a) => void lines.push(a.join(' ')));
  const err = vi.spyOn(console, 'error').mockImplementation((...a) => void lines.push(a.join(' ')));
  try {
    return { code: await run(argv, ENV), out: lines.join('\n') };
  } finally {
    log.mockRestore();
    err.mockRestore();
  }
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('verify-artifact-secrets', () => {
  it('fails on a secret hidden in the embedded report zip, naming the file and never the value', async () => {
    const dir = makeDir();
    writeFileSync(path.join(dir, 'index.html'), reportHtml({ 'a.json': `Fill "${SECRET}"` }));
    const { code, out } = await capture([dir]);
    expect(code).toBe(1);
    expect(out).toContain('index.html');
    expect(out).toContain('1 occurrence');
    expect(out).not.toContain(SECRET);
  });

  it('fails on a secret that is only an entry NAME in the embedded report zip, never printing it', async () => {
    const dir = makeDir();
    writeFileSync(path.join(dir, 'index.html'), reportHtml({ [`${SECRET}.json`]: '{}' }));
    const { code, out } = await capture([dir]);
    expect(code).toBe(1);
    expect(out).toContain('index.html');
    expect(out).not.toContain(SECRET);
  });

  it('fails on a plain file and on a zip file, and skips zip files on request', async () => {
    const dir = makeDir();
    mkdirSync(path.join(dir, 'sub'));
    writeFileSync(path.join(dir, 'sub', 'error-context.md'), `textbox: ${SECRET}`);
    writeFileSync(
      path.join(dir, 'trace.zip'),
      zipSync({ '0-trace.trace': Buffer.from(`x ${SECRET}`) })
    );
    const all = await capture([dir]);
    expect(all.code).toBe(1);
    expect(all.out).toContain('error-context.md');
    expect(all.out).toContain('trace.zip!0-trace.trace');
    expect(all.out).not.toContain(SECRET);
    const skipped = await capture(['--skip-zip-files', dir]);
    expect(skipped.out).toContain('error-context.md');
    expect(skipped.out).not.toContain('trace.zip');
  });

  it('passes a clean directory', async () => {
    const dir = makeDir();
    writeFileSync(path.join(dir, 'index.html'), reportHtml({ 'a.json': 'Fill "***REDACTED***"' }));
    const { code, out } = await capture([dir]);
    expect(code).toBe(0);
    expect(out).toContain('clean');
  });

  it('passes after the scrubber has run on the same directory', async () => {
    const dir = makeDir();
    writeFileSync(path.join(dir, 'index.html'), reportHtml({ 'a.json': `Fill "${SECRET}"` }));
    vi.stubEnv('E2E_FAKE_PASSWORD', SECRET);
    try {
      await scrubArtifactSecrets(dir);
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await capture([dir])).code).toBe(0);
  });

  it('exits 2 when given no directory', async () => {
    expect((await capture([])).code).toBe(2);
  });
});
