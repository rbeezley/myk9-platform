import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * MYK9-1114: the Playwright Regression's traces are deliberately not uploaded (MYK9-1057), so a red
 * in these two specs is diagnosable only from the `browser-diagnostics` attachment. This pins the
 * three links of that chain: the helper attaches it, the specs install it, and the upload step
 * still ships the HTML report (which inlines the attachment) for BOTH passes.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const workflow = read('.github/workflows/nightly-e2e.yml');
const helper = read('apps/myk9show/src/test/e2e/shared/browserDiagnostics.ts');

const WIRED_SPECS = [
  'apps/myk9show/src/test/e2e/secretary/resultsTabJourney.spec.ts',
  'apps/myk9show/src/test/e2e/show/atShowJudgeScoring.spec.ts',
  'apps/myk9show/src/test/e2e/slice2-dog-workspace-evidence.spec.ts',
];

describe('regression failure diagnostics', () => {
  it('the helper attaches one plain-text browser-diagnostics file, only on an unexpected result', () => {
    expect(helper).toContain("testInfo.attach('browser-diagnostics'");
    expect(helper).toContain("contentType: 'text/plain'");
    expect(helper).toContain('testInfo.status === testInfo.expectedStatus');
  });

  it.each(WIRED_SPECS)('%s installs the diagnostics in its describe block', specPath => {
    const spec = read(specPath);
    expect(spec).toMatch(
      /import \{ installBrowserDiagnostics \} from '\.\.?\/shared\/browserDiagnostics';/
    );
    expect(spec).toMatch(/^\s+installBrowserDiagnostics\(test\);$/m);
  });

  it('uploads both passes and excludes only trace archives, never the report data', () => {
    const uploadStep = workflow.slice(
      workflow.indexOf('- name: Upload Playwright regression reports')
    );
    const paths = uploadStep.slice(
      uploadStep.indexOf('path: |'),
      uploadStep.indexOf('retention-days')
    );
    const lines = paths
      .split('\n')
      .slice(1)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    expect(lines).toContain('apps/myk9show/playwright-report-ci/');
    expect(lines).toContain('apps/myk9show/playwright-report-ci-first/');
    expect(lines.filter(line => line.startsWith('!')).sort()).toEqual([
      '!apps/myk9show/playwright-report-ci-first/**/*.zip',
      '!apps/myk9show/playwright-report-ci/**/*.zip',
    ]);
    // The first pass is copied aside BEFORE the reset and second pass rewrite the report folder.
    expect(workflow).toContain(
      'cp -R apps/myk9show/playwright-report-ci apps/myk9show/playwright-report-ci-first'
    );
    expect(workflow.indexOf('- name: Preserve first regression report')).toBeLessThan(
      workflow.indexOf('- name: Run Playwright Regression Again')
    );
  });
});
