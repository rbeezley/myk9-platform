import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `useShowQuery` must keep react-query's DEFAULT network mode.
 *
 * Inheriting 'online' means the query PAUSES when the device is offline rather
 * than firing a request that cannot succeed. Six surfaces depend on that —
 * useShowWithQuery, useTrialDetailData, ClassManagementPage, SmartSignInPage,
 * ClassDetailsPage and the ownership resolver — and show-day flows run offline
 * by design (CLAUDE.md § Key Patterns / Offline-first data).
 *
 * PR #2180 set `networkMode: 'always'` here so a management deep link could
 * "resolve while offline". It could not: the offline-durable source is the
 * replicated show store, and a forced fetch offline just fails. The override
 * only cost every other consumer its pause. Caught by the Codex gate [P1].
 *
 * A source assertion is the right shape here precisely because the defect is a
 * config line with no observable behaviour in jsdom: react-query's pause needs
 * a real offline transition, and a behavioural test would assert against a
 * mocked onlineManager, i.e. against the mock. This pins the one line whose
 * presence IS the regression.
 */
const SOURCE = readFileSync(resolve(import.meta.dirname, '../useShowsDatabase.ts'), 'utf8');

/** The `useShowQuery` factory body, so a sibling query's config cannot mask a regression here. */
function useShowQueryBody(): string {
  const start = SOURCE.indexOf('export const useShowQuery =');
  expect(start, 'useShowQuery not found — did it move or get renamed?').toBeGreaterThan(-1);
  const end = SOURCE.indexOf('export const', start + 1);
  return SOURCE.slice(start, end === -1 ? undefined : end);
}

describe('useShowQuery network mode', () => {
  it('declares no networkMode override, so it inherits online and pauses offline', () => {
    expect(useShowQueryBody()).not.toMatch(/networkMode\s*:/);
  });

  it('positive control: the slice really is useShowQuery and carries its config', () => {
    // Without this, a bad slice (empty string) would satisfy the assertion above.
    const body = useShowQueryBody();
    expect(body).toContain('showQueryKeys.detail(id)');
    expect(body).toContain('cacheStrategies.fast');
  });
});
