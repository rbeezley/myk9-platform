/**
 * Type-hygiene guard for the time-limit chain feeding the ringside
 * ClassDetailsPopover.
 *
 * `ReplicatedClass.timeLimitSeconds` is an `as number` cast over a loosely
 * typed DB row, so a non-numeric placeholder (`"TBD"`) can reach the adapter
 * at runtime despite the type. `timeLimitString` must never launder such a
 * value into the `ClassInfo.timeLimit` string (`"TBDs"`) — the popover
 * re-parses that string with `parseInt`, and a junk parse yields `NaN`, which
 * the slot's `typeof === 'number'` guard would render as `"NaNs"`.
 *
 * Contract under test: `buildClassInfo`/`transformEntry` emit a `timeLimit`
 * that is EITHER `undefined` (no limit) OR a clean numeric-seconds string
 * (`/^\d+s$/`) — never a placeholder or `NaN`-bearing string.
 */

import { describe, it, expect } from 'vitest';
import { buildClassInfo, transformEntry } from './atShowDataAdapter';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

function makeClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return { id: 'class-1', name: 'Container Novice A', ...overrides };
}

function makeEntry(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return { id: 'entry-1', ...overrides } as ReplicatedEntry;
}

/** A `timeLimit` value is valid iff it is omitted or matches `\d+s`. */
const NUMERIC_SECONDS = /^\d+s$/;
function expectNumericOrUndefined(value: string | undefined) {
  if (value !== undefined) {
    expect(value).toMatch(NUMERIC_SECONDS);
  }
}

describe('buildClassInfo — timeLimit hygiene', () => {
  it('emits a clean numeric-seconds string for a real limit', () => {
    const info = buildClassInfo(
      makeClass({
        timeLimitSeconds: 180,
        timeLimitArea2Seconds: 120,
        timeLimitArea3Seconds: 90,
      }),
      null,
      []
    );
    expect(info.timeLimit).toBe('180s');
    expect(info.timeLimit2).toBe('120s');
    expect(info.timeLimit3).toBe('90s');
  });

  it('omits timeLimit entirely when no limit is set', () => {
    const info = buildClassInfo(makeClass(), null, []);
    expect(info.timeLimit).toBeUndefined();
    expect(info.timeLimit2).toBeUndefined();
    expect(info.timeLimit3).toBeUndefined();
  });

  // The type lie: a string placeholder arriving in a `number`-typed field.
  it('drops a non-numeric placeholder instead of laundering it to "TBDs"', () => {
    const info = buildClassInfo(
      makeClass({
        // `as never` reproduces the runtime type-lie (DB row carried "TBD").
        timeLimitSeconds: 'TBD' as never,
      }),
      null,
      []
    );
    expect(info.timeLimit).toBeUndefined();
    expectNumericOrUndefined(info.timeLimit);
  });

  it('drops NaN / non-finite / non-positive limits', () => {
    for (const junk of [NaN, Infinity, -Infinity, 0, -30]) {
      const info = buildClassInfo(makeClass({ timeLimitSeconds: junk }), null, []);
      expect(info.timeLimit).toBeUndefined();
    }
  });

  it('never emits a non-numeric timeLimit across the snake_case source too', () => {
    const info = buildClassInfo(
      makeClass({ time_limit_seconds: 'TBD' as never }),
      null,
      []
    );
    expectNumericOrUndefined(info.timeLimit);
    expect(info.timeLimit).toBeUndefined();
  });
});

describe('transformEntry — timeLimit hygiene', () => {
  it('carries a clean numeric-seconds string from the class', () => {
    const entry = transformEntry(makeEntry(), makeClass({ timeLimitSeconds: 180 }));
    expect(entry.timeLimit).toBe('180s');
  });

  it('drops a non-numeric placeholder rather than emit "TBDs"', () => {
    const entry = transformEntry(
      makeEntry(),
      makeClass({ timeLimitSeconds: 'TBD' as never })
    );
    expectNumericOrUndefined(entry.timeLimit);
    expect(entry.timeLimit).toBeUndefined();
  });
});
