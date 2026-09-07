import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `cancel-in-progress: true` on every ref cancelled 25 of 30 consecutive
 * `main` runs on 2026-09-06/07: merges landed faster than the push-only
 * coverage job finished, so `main` never carried a completed verdict.
 * PR runs may still be superseded; `main` runs must run to completion.
 */
const ci = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8');

describe('CI concurrency', () => {
  it('cancels superseded PR runs but never a main run', () => {
    const block = ci.match(/^concurrency:\n((?:  .*\n)+)/m)?.[1] ?? '';
    expect(block).toContain('group: ${{ github.workflow }}-${{ github.ref }}');
    expect(block).toContain("cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}");
  });
});
