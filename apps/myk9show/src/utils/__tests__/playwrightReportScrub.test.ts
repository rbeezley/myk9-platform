/**
 * MYK9-1128. Playwright records a typed value in the step title (`Fill "<value>"`),
 * and the HTML reporter stores per-test data (step titles included) as a base64 ZIP
 * inside index.html (`<template id="playwrightReportBase64">`). Plain-text scrubbing
 * of index.html cannot see inside it, so a signed-in spec published the e2e password
 * in a public Actions artifact.
 *
 * This test runs a REAL Playwright run (html reporter + the scrub reporter) and
 * inspects the produced report: plain files AND every entry of the embedded zip.
 * A positive control proves the harness can see the secret at all (the unscrubbed
 * run must contain it), so a vacuous pass is impossible.
 *
 * @vitest-environment node
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REPORTER = path.join(APP_ROOT, 'src/test/e2e/reporters/scrubSecretsReporter.ts');
const SECRET = 'FakeSecretForTest-91a7';
const TEMPLATE =
  /<template id="playwrightReportBase64">data:application\/zip;base64,([^<]*)<\/template>/;

const scratch = path.join(APP_ROOT, '.logs', `report-scrub-${process.pid}`);
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(full);
    else yield full;
  }
}

/** Runs one spec through the html reporter (+ optionally the scrub reporter). */
function runReport(name: string, withScrubber: boolean): string {
  const dir = path.join(scratch, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'leak.spec.ts'),
    `import { test } from '@playwright/test';
test('types a secret', async () => {
  // The same shape Playwright gives locator.fill(): the value rides in the step title.
  await test.step(\`Fill "\${process.env.FAKE_E2E_SECRET}"\`, async () => {});
});
`
  );
  const report = path.join(dir, 'report');
  const reporters = [
    `['html', { outputFolder: ${JSON.stringify(report)}, open: 'never' }]`,
    ...(withScrubber
      ? [`[${JSON.stringify(REPORTER)}, { outputDirs: [${JSON.stringify(dir)}] }]`]
      : []),
  ];
  writeFileSync(
    path.join(dir, 'playwright.config.ts'),
    `import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', reporter: [${reporters.join(',')}], outputDir: ${JSON.stringify(path.join(dir, 'out'))} });
`
  );
  const run = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--config', path.join(dir, 'playwright.config.ts')],
    {
      cwd: APP_ROOT,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true', FAKE_E2E_SECRET: SECRET, E2E_FAKE_PASSWORD: SECRET },
    }
  );
  const tail = (run.stdout + run.stderr).slice(-1500);
  expect(run.status, `playwright run must pass: ${tail}`).toBe(0);
  return report;
}

/** Every place the report keeps text: plain files plus each embedded-zip entry. */
function reportTexts(reportDir: string): string[] {
  const out: string[] = [];
  for (const file of files(reportDir)) {
    const text = readFileSync(file, 'utf8');
    out.push(text);
    const match = TEMPLATE.exec(text);
    if (match) {
      const entries = unzipSync(new Uint8Array(Buffer.from(match[1], 'base64')));
      for (const data of Object.values(entries)) out.push(Buffer.from(data).toString('utf8'));
    }
  }
  return out;
}

describe('HTML report embedded data (MYK9-1128)', () => {
  it('positive control: without the scrubber the embedded zip carries the secret', () => {
    const texts = reportTexts(runReport('control', false));
    expect(texts.some(t => t.includes(SECRET))).toBe(true);
  }, 120_000);

  it('with the scrub reporter, no plain file or embedded zip entry carries the secret', () => {
    const reportDir = runReport('scrubbed', true);
    expect(existsSync(path.join(reportDir, 'index.html'))).toBe(true);
    const texts = reportTexts(reportDir);
    // The embedded zip must still be readable and hold report data.
    expect(texts.length).toBeGreaterThan(2);
    expect(texts.some(t => t.includes('types a secret'))).toBe(true);
    expect(texts.filter(t => t.includes(SECRET))).toHaveLength(0);
  }, 120_000);
});
