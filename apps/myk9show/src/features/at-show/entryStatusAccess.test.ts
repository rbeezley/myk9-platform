/**
 * MYK9-1807: the one predicate for "may this viewer set this status on this entry?".
 * It mirrors the server's `self_checkin_entry` allow-list, so a drift between the two shows here.
 */
import { describe, expect, it } from 'vitest';
import { CHECKIN_STATUSES, EXHIBITOR_ALLOWED_STATUSES, STAFF_CHECK_IN_STATUSES } from '@myk9/core';
import {
  NOT_RUNNING_EXHIBITOR_MESSAGE,
  NOT_RUNNING_STAFF_MESSAGE,
  SELF_CHECKIN_REFUSED_MESSAGE,
  SelfCheckinRefusedError,
  SELF_SETTABLE_STATUSES,
  isSelfCheckinRefusal,
  maySetStatus,
  pickerStatuses,
  statusControlFor,
  statusRefusalMessage,
  viewerForRole,
  writerForRole,
} from './entryStatusAccess';

const own = { ownsEntry: true, selfCheckinEnabled: true, notRunning: false };

describe('self-settable statuses', () => {
  it('are exactly the statuses self_checkin_entry accepts (core exhibitor allow-list)', () => {
    expect([...SELF_SETTABLE_STATUSES].sort()).toEqual([...EXHIBITOR_ALLOWED_STATUSES].sort());
  });
});

describe('pickerStatuses', () => {
  it('lists an exhibitor only the self check-in statuses, in the staff order', () => {
    expect(pickerStatuses('exhibitor', false)).toEqual([
      'no-status',
      'checked-in',
      'conflict',
      'pulled',
      'at-gate',
    ]);
  });

  it('never offers an exhibitor Come to gate, In ring or Completed, even with ring management', () => {
    const offered = pickerStatuses('exhibitor', true);
    expect(offered).not.toContain('come-to-gate');
    expect(offered).not.toContain('in-ring');
    expect(offered).not.toContain('completed');
  });

  it('keeps the staff lists exactly as they were', () => {
    expect(pickerStatuses('staff', false)).toEqual(STAFF_CHECK_IN_STATUSES);
    expect(pickerStatuses('staff', true)).toEqual([
      ...STAFF_CHECK_IN_STATUSES,
      'in-ring',
      'completed',
    ]);
  });
});

describe('statusControlFor', () => {
  it('gives an exhibitor the control on their own dog', () => {
    expect(statusControlFor({ viewer: 'exhibitor', ...own })).toBe('open');
  });

  it('gives an exhibitor no control on a dog that is not theirs', () => {
    expect(statusControlFor({ viewer: 'exhibitor', ...own, ownsEntry: false })).toBe('none');
  });

  it('gives a passcode exhibitor with no person record no control anywhere', () => {
    // No person record means no owned entries at all.
    expect(statusControlFor({ viewer: 'exhibitor', ...own, ownsEntry: false })).toBe('none');
  });

  it('opens the "self check-in is off" dialog for an exhibitor when the class turned it off', () => {
    expect(statusControlFor({ viewer: 'exhibitor', ...own, selfCheckinEnabled: false })).toBe(
      'self-checkin-off'
    );
  });

  it('leaves staff the control on every dog, whoever owns it and whatever self check-in says', () => {
    for (const ownsEntry of [true, false]) {
      for (const selfCheckinEnabled of [true, false]) {
        expect(
          statusControlFor({ viewer: 'staff', ownsEntry, selfCheckinEnabled, notRunning: false })
        ).toBe('open');
      }
    }
  });

  it('offers nobody a control on a dog scratched or withdrawn from the entry', () => {
    expect(statusControlFor({ viewer: 'staff', ...own, notRunning: true })).toBe('reinstate-staff');
    expect(statusControlFor({ viewer: 'exhibitor', ...own, notRunning: true })).toBe('reinstate');
  });
});

describe('maySetStatus', () => {
  it('lets staff set every status the pickers offer, on any dog', () => {
    for (const status of CHECKIN_STATUSES) {
      expect(
        maySetStatus({
          viewer: 'staff',
          ownsEntry: false,
          selfCheckinEnabled: false,
          notRunning: false,
          status,
        })
      ).toBe(true);
    }
  });

  it('lets an exhibitor set only the self check-in statuses on their own dog', () => {
    for (const status of CHECKIN_STATUSES) {
      expect(maySetStatus({ viewer: 'exhibitor', ...own, status })).toBe(
        SELF_SETTABLE_STATUSES.has(status)
      );
    }
  });

  it('refuses an exhibitor on another dog, or when self check-in is off', () => {
    expect(
      maySetStatus({ viewer: 'exhibitor', ...own, ownsEntry: false, status: 'checked-in' })
    ).toBe(false);
    expect(
      maySetStatus({ viewer: 'exhibitor', ...own, selfCheckinEnabled: false, status: 'checked-in' })
    ).toBe(false);
  });
});

describe('isSelfCheckinRefusal', () => {
  it.each([
    'Not authorized: caller does not own entry e1 or self check-in is disabled',
    'Not authorized: caller is not linked to a person record',
    'Status in-ring is not allowed for self-check-in',
  ])('recognizes the server refusal "%s"', message => {
    expect(isSelfCheckinRefusal(new Error(message))).toBe(true);
    expect(isSelfCheckinRefusal({ message })).toBe(true);
  });

  it('does not mistake a failure that merely mentions self check-in for a refusal', () => {
    expect(isSelfCheckinRefusal(new Error('self check-in is disabled'))).toBe(false);
    expect(isSelfCheckinRefusal(new Error('Not authorized to refresh'))).toBe(false);
  });

  it("knows the write's own refusal wrapper", () => {
    expect(isSelfCheckinRefusal(new SelfCheckinRefusedError(new Error('anything')))).toBe(true);
  });

  it('does not mistake a network failure for a refusal', () => {
    expect(isSelfCheckinRefusal(new Error('Failed to fetch'))).toBe(false);
    expect(isSelfCheckinRefusal(undefined)).toBe(false);
  });
});

describe('refused-write message', () => {
  it('is plain words with no em dash', () => {
    expect(SELF_CHECKIN_REFUSED_MESSAGE).not.toContain('—');
  });
});

describe('one definition of exhibitor', () => {
  it.each([
    ['admin', 'staff', 'replicated'],
    ['judge', 'staff', 'replicated'],
    ['steward', 'staff', 'replicated'],
    ['exhibitor', 'exhibitor', 'self-checkin-rpc'],
    [null, 'exhibitor', 'self-checkin-rpc'],
  ] as const)('role %s is a %s viewer written by %s', (role, viewer, writer) => {
    expect(viewerForRole(role)).toBe(viewer);
    expect(writerForRole(role)).toBe(writer);
  });
});

describe('statusRefusalMessage', () => {
  const gone = { ...own, notRunning: true, status: 'checked-in' };

  it('words a not-running row for who is looking', () => {
    expect(statusRefusalMessage({ viewer: 'staff', ...gone })).toBe(NOT_RUNNING_STAFF_MESSAGE);
    expect(statusRefusalMessage({ viewer: 'exhibitor', ...gone })).toBe(
      NOT_RUNNING_EXHIBITOR_MESSAGE
    );
  });

  it('is null when the write may go', () => {
    expect(statusRefusalMessage({ viewer: 'staff', ...own, status: 'in-ring' })).toBeNull();
  });

  it('uses the self check-in sentence for any other refusal', () => {
    expect(
      statusRefusalMessage({ viewer: 'exhibitor', ...own, ownsEntry: false, status: 'checked-in' })
    ).toBe(SELF_CHECKIN_REFUSED_MESSAGE);
  });
});
