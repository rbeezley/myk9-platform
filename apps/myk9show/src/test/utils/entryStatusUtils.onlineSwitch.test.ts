/**
 * A show whose online-entries value is not known yet (a stale cached row) is
 * never enterable: no exhibitor surface offers "Enter This Show" / "Add Entry".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEntryStatus, isEntryWindowNotOpen } from '@/utils/entryStatusUtils';
import type { Show } from '@/types/show-types';

function show(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Test Show',
    entryOpenDate: '2024-01-01',
    entryCloseDate: '2024-02-01',
    startDate: '2024-02-15',
    endDate: '2024-02-16',
    ...overrides,
  } as Show;
}

describe('getEntryStatus — online entries value (MYK9-979)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 15, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('positive control: a show with online entries on accepts entries', () => {
    expect(getEntryStatus(show({ onlineEntriesEnabled: true }))).toMatchObject({
      status: 'accepting',
      canEnter: true,
    });
  });

  // Codex P2 on #2707: a replica row cached before the column existed carries
  // no value. It must not read as enterable until the value arrives.
  it.each([undefined, null])('withholds entry while the switch is unknown (%s)', value => {
    const status = getEntryStatus(
      show({ onlineEntriesEnabled: value as unknown as boolean }),
      true
    );
    expect(status).toMatchObject({ status: 'window_unknown', canEnter: false });
    expect(isEntryWindowNotOpen(status.status)).toBe(true);
  });
});
