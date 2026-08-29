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
    '%s registers a globalTeardown',
    (_label, configPath) => {
      expect(existsSync(configPath)).toBe(true);
      expect(readFileSync(configPath, 'utf8')).toContain('globalTeardown');
    }
  );

  it('the teardown module every config points at exists', () => {
    expect(existsSync(path.join(APP_ROOT, 'src/test/e2e/helpers/scrubArtifactSecrets.ts'))).toBe(
      true
    );
  });

  it('lists every playwright config in the repo, so a new one cannot be missed', () => {
    // If this fails, a config was added: register the teardown on it and add it above.
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
