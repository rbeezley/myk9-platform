/**
 * Tests for class-status detection + display utilities.
 *
 * Lifted from `apps/myk9q/src/utils/statusUtils.test.ts` during PR E1a,
 * specifically the `class status utilities` describe block. The
 * entry-related describes (`determineEntryStatus`, `entry status
 * display utilities`) remain in `apps/myk9q/src/utils/statusUtils.test.ts`
 * pending PR E2.
 */

import { describe, expect, test } from 'vitest';

import { getClassDisplayStatus as getCoreClassDisplayStatus } from '@myk9/core';

import {
  getClassDisplayStatus,
  getEffectiveClassStatus,
  type ClassStatusInput,
} from './classStatus';

function makeClassEntry(overrides: Partial<ClassStatusInput> = {}): ClassStatusInput {
  return {
    id: '1',
    class_status: 'no-status',
    entry_count: 3,
    completed_count: 0,
    dogs: [],
    ...overrides,
  };
}

describe('class status utilities', () => {
  test('prioritizes finalized and manual class statuses', () => {
    expect(getClassDisplayStatus(makeClassEntry({ is_scoring_finalized: true }))).toBe('completed');
    expect(getClassDisplayStatus(makeClassEntry({ class_status: 'completed' }))).toBe('completed');
    expect(getClassDisplayStatus(makeClassEntry({ class_status: 'in_progress' }))).toBe(
      'in-progress'
    );
  });

  test('detects progress only for no-status classes', () => {
    // Decision 5: no per-entry scratch state on this input shape, so
    // completed_count === entry_count no longer verdicts "completed" on its
    // own — it falls to "in-progress" until is_scoring_finalized/manual
    // status confirms completion server-side.
    expect(
      getClassDisplayStatus(
        makeClassEntry({
          completed_count: 3,
          entry_count: 3,
        })
      )
    ).toBe('in-progress');
    expect(
      getClassDisplayStatus(
        makeClassEntry({
          dogs: [{ in_ring: true }],
        })
      )
    ).toBe('in-progress');
    expect(getClassDisplayStatus(makeClassEntry({ completed_count: 1 }))).toBe('in-progress');
  });

  test('keeps manual setup status from being overridden by progress counts', () => {
    expect(
      getClassDisplayStatus(makeClassEntry({ class_status: 'setup', completed_count: 1 }))
    ).toBe('not-started');
  });

  test('derives only the effective operational class state', () => {
    expect(getEffectiveClassStatus(makeClassEntry({ class_status: 'offline-scoring' }))).toBe(
      'offline-scoring'
    );
    expect(getEffectiveClassStatus(makeClassEntry({ class_status: 'briefing' }))).toBe('briefing');
    expect(
      getEffectiveClassStatus(makeClassEntry({ class_status: 'no-status', completed_count: 1 }))
    ).toBe('in-progress');
    expect(
      getEffectiveClassStatus(
        makeClassEntry({ class_status: 'in_progress', is_scoring_finalized: true })
      )
    ).toBe('completed');
  });
});

describe('getClassDisplayStatus — Decision 5 dual-path client reconciliation', () => {
  // openspec/changes/class-status-auto-derivation/specs/status-display/spec.md

  test('does not contradict a server-completed class when the local snapshot is mid-sync', () => {
    // Server wrote is_scoring_finalized=true, but this client's local dogs
    // array/counts haven't synced the last scoring row yet.
    expect(
      getClassDisplayStatus(
        makeClassEntry({
          class_status: 'in_progress',
          is_scoring_finalized: true,
          entry_count: 5,
          completed_count: 4,
        })
      )
    ).toBe('completed');
  });

  test('excludes a scratched entry from completeness via is_scoring_finalized (input has no per-entry scratch state)', () => {
    // ClassStatusInput/ClassDog carry no per-entry scratch/withdrawn state,
    // so the client cannot itself exclude the scratched entry from
    // "expected". It defers to the server's is_scoring_finalized, which
    // already applied that exclusion (Decision 2), instead of guessing from
    // completed_count === entry_count.
    expect(
      getClassDisplayStatus(
        makeClassEntry({
          class_status: 'completed',
          is_scoring_finalized: true,
          entry_count: 5,
          completed_count: 4,
        })
      )
    ).toBe('completed');
  });

  test('core and ringside derivations agree for the same inputs', () => {
    const cases: Array<{
      core: Parameters<typeof getCoreClassDisplayStatus>[0];
      ringside: ClassStatusInput;
    }> = [
      {
        core: {
          status: 'in_progress',
          is_scoring_finalized: true,
          entry_count: 5,
          scored_count: 4,
        },
        ringside: makeClassEntry({
          class_status: 'in_progress',
          is_scoring_finalized: true,
          entry_count: 5,
          completed_count: 4,
        }),
      },
      {
        core: { status: 'completed', entry_count: 5, scored_count: 0 },
        ringside: makeClassEntry({ class_status: 'completed', entry_count: 5, completed_count: 0 }),
      },
      {
        core: { status: 'in_progress', entry_count: 5, scored_count: 0 },
        ringside: makeClassEntry({
          class_status: 'in_progress',
          entry_count: 5,
          completed_count: 0,
        }),
      },
      {
        // 'setup' (core's DB status) and 'no-status' (ringside's default,
        // untouched) both mean "no scoring activity recorded yet" — the one
        // status pairing that's semantically comparable between the two
        // otherwise-distinct status vocabularies (ringside also has
        // UI-only manual states like briefing/break/start_time that core
        // has no equivalent for, so those are intentionally not compared).
        core: { status: 'setup', entry_count: 3, scored_count: 0 },
        ringside: makeClassEntry({ entry_count: 3, completed_count: 0 }),
      },
      {
        // Neither derivation should verdict "completed" from raw-count
        // equality alone (Decision 5).
        core: {
          status: 'no-status',
          entry_count: 3,
          scored_count: 3,
        },
        ringside: makeClassEntry({ entry_count: 3, completed_count: 3 }),
      },
    ];

    for (const { core, ringside } of cases) {
      expect(getCoreClassDisplayStatus(core)).toBe(getClassDisplayStatus(ringside));
    }
  });
});
