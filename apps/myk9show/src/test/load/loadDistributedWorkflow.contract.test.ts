import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSessionAssignments } from './loadAssignments';
import { G9_NORMAL_SCENARIO } from './loadScenario';
import { DISTRIBUTED_G9_SHARD_COUNT, selectShardAssignments } from './loadShard';

describe('manual distributed load workflow', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '../../.github/workflows/load-rehearsal.yml'),
    'utf8'
  );

  it('is manual-only and fans the whole workload across every free runner shard', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/\b(schedule|push|pull_request):/);
    expect(workflow).toContain('runs-on: ubuntu-latest');

    // Derived from the constant the harness actually validates against, so the
    // topology cannot change in one place and silently disagree with the other.
    const indexes = Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) => index);
    expect(workflow).toContain(`shard: [${indexes.join(', ')}]`);
    expect(workflow).toMatch(
      new RegExp(`LOAD_TEST_SHARD_COUNT:\\s*['"]?${DISTRIBUTED_G9_SHARD_COUNT}['"]?`)
    );
    // Shards must all be live at the same barrier; throttling below the matrix
    // size would leave some starting after the synchronized start.
    expect(workflow).toContain(`max-parallel: ${DISTRIBUTED_G9_SHARD_COUNT}`);

    const sizes = Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) =>
      selectShardAssignments(buildSessionAssignments(G9_NORMAL_SCENARIO), {
        count: DISTRIBUTED_G9_SHARD_COUNT,
        index,
      })
    ).map(shard => shard.length);
    expect(workflow).toContain(
      `Run synchronized ${Math.min(...sizes)}/${Math.max(...sizes)}-session shard with generator telemetry`
    );
  });

  it('samples the platform from a browser-free job whose artifact name pairs', () => {
    // Name-pairing only: the load-bearing guard is the behavioral throw in
    // loadShardAggregation when a shard carries telemetry. A typo in either
    // half of this artifact name would otherwise surface only during a live
    // rehearsal against shared staging.
    const uploads = workflow.match(/name: load-platform/g) ?? [];
    expect(uploads).toHaveLength(2);
    expect(workflow).toContain('run: pnpm exec tsx scripts/run-load-platform.ts');
    expect(workflow).toContain('needs: [prepare, shard, platform]');
    expect(workflow).toContain('needs: [prepare, shard, platform, aggregate]');
    // The sampler must not build or drive a browser; that co-location is the
    // defect this job exists to remove.
    // Slice to the NEXT top-level job, not to a named one: keying off '  shard:'
    // returns '' if the jobs are ever reordered, and both assertions below would
    // then pass vacuously.
    const platformStart = workflow.indexOf('\n  platform:\n');
    expect(platformStart).toBeGreaterThan(-1);
    const nextJob = workflow.slice(platformStart + 1).search(/\n {2}[\w-]+:\n/);
    expect(nextJob).toBeGreaterThan(0);
    const platformJob = workflow.slice(platformStart, platformStart + 1 + nextJob);
    expect(platformJob).toContain('run-load-platform.ts');
    expect(platformJob).not.toContain('playwright');
    expect(platformJob).not.toContain('LOAD_TEST_START_APP');
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
    expect(workflow).toContain(
      "has_function_privilege('authenticated', 'public.ringside_update_entry(uuid,jsonb,integer)', 'EXECUTE')"
    );
    expect(workflow).toContain('Abort and drain in-flight scoring work');
    expect(workflow).toContain('scripts/load-cleanup.ts');
    expect(workflow.match(/scripts\/load-packet-cleanup\.ts/g)).toHaveLength(2);
    expect(workflow.match(/Clear canonical trial packet snapshots/g)).toHaveLength(2);
    expect(workflow).toContain('Verify Supabase CPU/IO telemetry source');
    expect(workflow).toContain('Mark rehearsal ownership window');
    expect(workflow).toContain('clock_timestamp()');
    expect(workflow).toContain('LOAD_TEST_OWNED_SINCE_US');
    expect(workflow).toContain('${{ env.LOAD_TEST_PROJECT_REF }}');
    expect(workflow).toContain('${{ env.LOAD_TEST_DB_HOST }}');
    expect(workflow.indexOf('Abort and drain in-flight scoring work')).toBeLessThan(
      workflow.indexOf('Restore canonical seed')
    );
    expect(workflow.indexOf('Mark rehearsal ownership window')).toBeLessThan(
      workflow.indexOf('Mark canonical restoration required')
    );
    expect(workflow.indexOf('Verify Supabase CPU/IO telemetry source')).toBeLessThan(
      workflow.indexOf('Canonical reseed')
    );
    const firstPacketCleanup = workflow.indexOf('Clear canonical trial packet snapshots');
    const firstSeed = workflow.indexOf('Canonical reseed');
    const secondPacketCleanup = workflow.lastIndexOf('Clear canonical trial packet snapshots');
    const secondSeed = workflow.lastIndexOf('Restore canonical seed');
    expect(firstPacketCleanup).toBeLessThan(firstSeed);
    expect(secondPacketCleanup).toBeLessThan(secondSeed);
  });

  it('approval-gates the preparation job once and offers a realistic preparation window', () => {
    expect(workflow.match(/environment: load-rehearsal/g)).toHaveLength(1);
    expect(workflow).toContain("default: '25'");
    expect(workflow).toContain("- '25'");
    expect(workflow).toContain("- '35'");
    // '15' was withdrawn with the 16-shard topology: per-shard setup is a full
    // production build plus Playwright, and 16 simultaneous runner allocations
    // add latency on top. A shard that misses the barrier fails the whole run.
    expect(workflow).not.toContain("- '15'");
    // The reseed is irreversible, so headroom must be checked before it.
    const preflight = workflow.indexOf('Verify enough concurrent-runner headroom');
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(workflow.indexOf('Canonical reseed'));
    expect(workflow).toMatch(
      /name: Load shard \$\{\{ matrix\.shard \}\}[\s\S]*?timeout-minutes: 55/
    );
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
