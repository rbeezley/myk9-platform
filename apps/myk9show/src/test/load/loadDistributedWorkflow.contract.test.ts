import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('manual distributed load workflow', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '../../.github/workflows/load-rehearsal.yml'),
    'utf8'
  );

  it('is manual-only and fans out exactly four free runner shards', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/\b(schedule|push|pull_request):/);
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).toMatch(/shard:\s*\[0,\s*1,\s*2,\s*3\]/);
    expect(workflow).toMatch(/LOAD_TEST_SHARD_COUNT:\s*['"]?4['"]?/);
  });

  it('fails closed on target confirmation and always restores the canonical seed', () => {
    expect(workflow).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(workflow).toContain('SUPABASE_DB_PASSWORD');
    expect(workflow).toContain('restore-required: ${{ steps.restore.outputs.required }}');
    expect(workflow).toContain('id: restore');
    expect(workflow).toContain(
      "if: ${{ always() && needs.prepare.outputs.restore-required == 'true' }}"
    );
    expect(workflow).not.toContain(
      "if: ${{ always() && needs.prepare.result == 'success' }}\n    runs-on: ubuntu-latest\n    timeout-minutes: 12"
    );
    expect(workflow).toContain('supabase/seed-demo.sql');
    expect(workflow).toContain('514|504|0');
  });

  it('protects every remote rehearsal job and offers a realistic preparation window', () => {
    expect(workflow.match(/environment: load-rehearsal/g)).toHaveLength(4);
    expect(workflow).toContain("default: '25'");
    expect(workflow).toContain("- '15'");
    expect(workflow).toContain("- '25'");
    expect(workflow).toContain("- '35'");
  });

  it('does not depend on Vercel or paid runner labels', () => {
    expect(workflow).not.toMatch(/VERCEL|larger-runner|self-hosted/i);
  });
});

describe('routine load harness validation', () => {
  const workflow = readFileSync(resolve(process.cwd(), '../../.github/workflows/ci.yml'), 'utf8');

  it('runs unit contracts and Playwright discovery without load credentials', () => {
    expect(workflow).toContain('pnpm --filter @myk9/show test:load:unit');
    expect(workflow).toContain('pnpm --filter @myk9/show test:load:list');
    expect(workflow).toContain('LOAD_TEST_MODE: discovery');
  });
});
