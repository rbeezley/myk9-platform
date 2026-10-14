import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/nightly-e2e.yml'), 'utf8');
const regressionScript = readFileSync(
  resolve(process.cwd(), 'scripts/qa/run-playwright-regression.sh'),
  'utf8'
);

describe('isolated Playwright regression workflow', () => {
  it('uses a local Supabase lifecycle and never receives shared Supabase URLs', () => {
    expect(workflow).toMatch(/supabase\/setup-cli@v\d+/);
    expect(workflow).toContain('run: pnpm qa:isolated-e2e:prepare');
    expect(workflow).toContain('run: pnpm qa:isolated-e2e:reset');
    expect(workflow).toContain('run: pnpm qa:isolated-e2e:stop');
    expect(workflow).toContain('MYK9_E2E_APPROVED_PROJECT_REFS: local');
    expect(workflow).toContain('MYK9_E2E_SUPABASE_PROJECT_REF: local');
    expect(workflow).not.toContain('VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}');
    expect(workflow).not.toContain('VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}');
    expect(workflow).not.toContain(
      'SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}'
    );
    expect(workflow).not.toContain('MYK9_PLAYWRIGHT_REGRESSION_TARGET: ${{ secrets.');
  });

  it('runs weekly and on demand with two regression passes and preserved reports', () => {
    const resetStep = workflow.slice(
      workflow.indexOf('- name: Reset isolated target'),
      workflow.indexOf('- name: Run Playwright Regression Again')
    );

    expect(workflow.match(/run: pnpm qa:playwright:regression/g)).toHaveLength(2);
    expect(workflow).toContain('playwright-report-ci-first');
    expect(workflow).toContain('apps/myk9show/playwright-report-ci/');
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain("cron: '0 7 * * 1'");
    expect(workflow).toContain('workflow_dispatch: {}');
    expect(workflow).toContain("if: vars.MYK9SHOW_REGRESSION_CI_ENABLED == 'true'");
    expect(resetStep).toContain("MYK9_PLAYWRIGHT_REGRESSION_ENABLED: 'true'");
    expect(resetStep).toContain('MYK9_PLAYWRIGHT_REGRESSION_TARGET: isolated');
    expect(regressionScript).toContain('--fail-on-flaky-tests --workers=1 --retries=0');
    expect(regressionScript).toMatch(
      /pnpm --dir apps\/myk9show exec playwright test \\\s+--config=playwright\.ci\.config\.ts/
    );
    expect(regressionScript).not.toContain('test:e2e:regression --');
  });

  it('hands the Stripe test key to staging and both regression passes, never to GITHUB_ENV', () => {
    const step = (name: string) => {
      const start = workflow.indexOf(`- name: ${name}\n`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      const next = workflow.indexOf('\n      - ', start + 1);
      return workflow.slice(start, next === -1 ? undefined : next);
    };
    const keyLine = 'STRIPE_TEST_SECRET_KEY: ${{ secrets.STRIPE_TEST_SECRET_KEY }}';
    expect(step('Prepare isolated Supabase target')).toContain(keyLine);
    expect(step('Run Playwright Regression')).toContain(keyLine);
    expect(step('Run Playwright Regression Again')).toContain(keyLine);
    expect(step('Verify no secrets in artifacts (Playwright regression reports)')).toContain(
      'MYK9_STRIPE_TEST_KEY_SECRET: ${{ secrets.STRIPE_TEST_SECRET_KEY }}'
    );
    expect(workflow).not.toMatch(/GITHUB_ENV.*STRIPE/);
  });
});
