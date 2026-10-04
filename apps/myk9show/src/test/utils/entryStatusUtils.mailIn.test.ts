/**
 * MYK9-979: a show with online entries off reads as mail-in only while its
 * window is open, so no exhibitor surface offers "Enter This Show" / "Add
 * Entry" for it (the server would refuse the entry).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEntryStatus, isEntryWindowNotOpen } from '@/utils/entryStatusUtils';
import { MAIL_IN_ENTRY_NOTE } from '@/features/payments/onlineEntryGate';
import type { Show } from '@/types/show-types';

function show(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Mail-in Show',
    entryOpenDate: '2024-01-01',
    entryCloseDate: '2024-02-01',
    startDate: '2024-02-15',
    endDate: '2024-02-16',
    ...overrides,
  } as Show;
}

describe('getEntryStatus — online entries off (MYK9-979)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 15, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is mail_in_only, not enterable, and explains how to enter while the window is open', () => {
    expect(getEntryStatus(show({ onlineEntriesEnabled: false }))).toMatchObject({
      status: 'mail_in_only',
      description: MAIL_IN_ENTRY_NOTE,
      canEnter: false,
    });
  });

  it('wins over an existing (staff-keyed) entry, so no "Add Entry" is offered', () => {
    expect(getEntryStatus(show({ onlineEntriesEnabled: false }), true)).toMatchObject({
      status: 'mail_in_only',
      canEnter: false,
    });
  });

  it('positive control: the same show with online entries on accepts entries', () => {
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

  it('keeps the window states: not yet open and closed still read as such', () => {
    expect(
      getEntryStatus(show({ onlineEntriesEnabled: false, entryOpenDate: '2024-01-20' })).status
    ).toBe('not_yet_open');
    expect(
      getEntryStatus(show({ onlineEntriesEnabled: false, entryCloseDate: '2024-01-10' })).status
    ).toBe('closed');
  });

  it('is not an entry-window state for the landing gate', () => {
    expect(isEntryWindowNotOpen('mail_in_only')).toBe(false);
  });
});
