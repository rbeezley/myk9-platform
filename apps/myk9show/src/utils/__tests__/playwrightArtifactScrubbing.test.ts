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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

/**
 * MYK9-1128. The scrubber is a best-effort rewrite; the verification step is the
 * gate that fails the job if a secret still survives. Discovered from the workflow
 * files, so a new Playwright artifact upload cannot ship without it.
 */
describe('every Playwright artifact upload is gated by the secret verification step', () => {
  const workflowDir = path.join(REPO_ROOT, '.github/workflows');
  const uploads = readdirSync(workflowDir)
    .filter(f => f.endsWith('.yml'))
    .flatMap(file => {
      const steps = readFileSync(path.join(workflowDir, file), 'utf8').split(/^ {6}- name: /m);
      return steps.flatMap((step, i) =>
        step.includes('actions/upload-artifact') &&
        /apps\/myk9show\/(playwright-report|test-results\/readiness)/.test(step)
          ? [{ file, step, previous: steps[i - 1] ?? '' }]
          : []
      );
    });

  it('finds the known uploads (guards the discovery itself)', () => {
    expect(uploads.length).toBeGreaterThanOrEqual(6);
  });

  it.each(uploads.map(u => [`${u.file}: ${u.step.split('\n')[0]}`, u]))(
    '%s verifies, over the same directories, before it uploads',
    (_label, upload) => {
      const { step, previous } = upload as (typeof uploads)[number];
      expect(previous).toContain('id: verify-artifacts');
      expect(previous).toContain('scripts/verify-artifact-secrets.ts');
      // A failed verification must skip the upload: `always()` alone would not.
      expect(step).toContain("steps.verify-artifacts.outcome != 'failure'");
      const uploaded = [...step.matchAll(/^\s+apps\/myk9show\/([^\s!]+?)\/?$/gm)].map(m => m[1]);
      expect(uploaded.length).toBeGreaterThan(0);
      for (const dir of uploaded) expect(previous).toContain(dir);
    }
  );
});
