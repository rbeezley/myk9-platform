/**
 * F10, second pass. Codex caught that the scrubber was registered ONLY on
 * `playwright.config.ts`, the config a developer runs locally — while CI runs
 * `test:e2e:ci` and `test:a11y` through `playwright.ci.config.ts` and uploads
 * `playwright-report-ci/` from both jobs (.github/workflows/ci.yml). The fix
 * therefore protected nothing that CI actually publishes.
 *
 * These configs are not importable here (they pull @playwright/test and a dotenv
 * load at module scope), so this asserts REGISTRATION, not behaviour: every config
 * names a globalTeardown, and the file it names exists. The scrubbing behaviour
 * itself is covered by scrubArtifactSecrets.test.ts. That split is deliberate — a
 * source check can honestly prove "this config is wired up", which is precisely
 * the failure mode here, and nothing more.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REPO_ROOT = path.resolve(APP_ROOT, '../..');

const CONFIGS = [
  path.join(APP_ROOT, 'playwright.config.ts'),
  path.join(APP_ROOT, 'playwright.ci.config.ts'),
  path.join(APP_ROOT, 'playwright.audit.config.ts'),
  path.join(APP_ROOT, 'playwright.readiness.config.ts'),
  path.join(APP_ROOT, 'playwright.load.config.ts'),
  path.join(REPO_ROOT, 'playwright.config.ts'),
];

describe('every Playwright config scrubs secrets from its artifacts', () => {
  it.each(CONFIGS.map(c => [path.relative(REPO_ROOT, c), c]))(
    '%s registers the scrub reporter',
    (_label, configPath) => {
      expect(existsSync(configPath)).toBe(true);
      const text = readFileSync(configPath, 'utf8');
      expect(text).toContain('scrubSecretsReporter');
      // It must be a REPORTER, not a teardown: Playwright awaits every task
      // (teardown included) BEFORE calling reporter.onEnd, and the html reporter
      // writes its report inside that onEnd -- so a teardown runs before the
      // artifact CI uploads even exists. Match the config KEY, not the word, so
      // this does not trip over prose in a comment.
      expect(text).not.toMatch(/^\s*globalTeardown:/m);
    }
  );

  it('the reporter module every config points at exists', () => {
    expect(existsSync(path.join(APP_ROOT, 'src/test/e2e/reporters/scrubSecretsReporter.ts'))).toBe(
      true
    );
  });

  it('registers the scrubber LAST, after the html reporter', () => {
    for (const configPath of CONFIGS) {
      const text = readFileSync(configPath, 'utf8');
      const html = text.indexOf("'html'");
      if (html === -1) continue;
      expect(text.indexOf('scrubSecretsReporter')).toBeGreaterThan(html);
    }
  });

  it('lists every playwright config in the repo, so a new one cannot be missed', () => {
    // If this fails, a config was added: register the reporter on it and add it above.
    const known = new Set(CONFIGS.map(c => path.resolve(c)));
    const appConfigs =
      readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')
        .match(/playwright\.[a-z]+\.config\.ts/g)
        ?.map(name => path.join(APP_ROOT, name)) ?? [];
    for (const config of appConfigs) {
      expect(known.has(path.resolve(config))).toBe(true);
    }
  });
});
