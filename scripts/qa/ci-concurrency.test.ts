import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `cancel-in-progress: true` on a ref-keyed group cancelled 25 of 30
 * consecutive `main` runs on 2026-09-06/07: merges landed faster than the
 * push-only coverage job finished, so `main` never carried a completed
 * verdict. Turning cancellation off is not enough: GitHub keeps ONE queued
 * run per group, so a third merge still replaces the second's pending run
 * (Codex review of #2110). Main runs therefore get a per-SHA group; PR runs
 * keep the per-ref group and are superseded on push.
 *
 * Merge-queue runs (MYK9-2239) are treated like `main` runs: cancelling one
 * would leave the queued PR without a verdict. The event name is part of the
 * key, so the queue run and the later `main` push run for the same SHA never
 * share a group (the push run's Queue verdict job waits on the queue run).
 */
const ci = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8');

describe('CI concurrency', () => {
  const block = ci.match(/^concurrency:\n((?:  .*\n)+)/m)?.[1] ?? '';

  it('keys main and merge-queue runs by event and SHA so they are never cancelled or replaced', () => {
    expect(block).toContain(
      "group: ${{ github.workflow }}-${{ (github.ref == 'refs/heads/main' || github.event_name == 'merge_group') && format('{0}-{1}', github.event_name, github.sha) || github.ref }}"
    );
    expect(block).toContain(
      "cancel-in-progress: ${{ github.ref != 'refs/heads/main' && github.event_name != 'merge_group' }}"
    );
  });

  it('still keys PR runs by ref (positive control that the expression has both arms)', () => {
    expect(block).toMatch(
      /&& format\('\{0\}-\{1\}', github\.event_name, github\.sha\) \|\| github\.ref \}\}/
    );
  });
});
