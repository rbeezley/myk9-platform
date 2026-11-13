/**
 * MYK9-1807: the combined A and B list asks each dog's OWN class whether self check-in is on,
 * because that is what the server's `self_checkin_entry` does.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '@myk9/ringside';
import {
  OWNERSHIP_CHECKING_NOTICE,
  OWNERSHIP_OFFLINE_NOTICE,
  useEntryStatusAccess,
} from './useEntryStatusAccess';

const own = vi.hoisted(() => ({ unknown: false, online: true }));

vi.mock('./useMyAtShowEntries', () => ({
  useMyAtShowEntries: () => ({
    ownEntryIds: new Set(['a', 'b']),
    ownClassIds: new Set<string>(),
    isLoading: false,
    isUnknown: own.unknown,
  }),
}));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => own.online }));

const dog = (id: string, classId: string): Entry => ({ id, classId }) as unknown as Entry;
const dogA = dog('a', 'class-a');
const dogB = dog('b', 'class-b');

function controls(role: string | null, off: string[]) {
  const { result } = renderHook(() =>
    useEntryStatusAccess({
      role,
      showId: 'show-1',
      selfCheckinFor: classId => !off.includes(classId),
    })
  );
  return {
    a: result.current.statusAccess.controlFor(dogA),
    b: result.current.statusAccess.controlFor(dogB),
    refusalB: result.current.statusRefusalFor(dogB, 'checked-in'),
  };
}

describe('useEntryStatusAccess per entry class', () => {
  it('A on, B off: each exhibitor dog gets its own class answer', () => {
    const got = controls('exhibitor', ['class-b']);
    expect(got.a).toBe('open');
    expect(got.b).toBe('self-checkin-off');
    expect(got.refusalB).not.toBeNull();
  });

  it('A off, B on: the answers swap', () => {
    const got = controls('exhibitor', ['class-a']);
    expect(got.a).toBe('self-checkin-off');
    expect(got.b).toBe('open');
    expect(got.refusalB).toBeNull();
  });

  it('staff are not held to self check-in in either section', () => {
    const got = controls('admin', ['class-a', 'class-b']);
    expect(got.a).toBe('open');
    expect(got.b).toBe('open');
  });
});

describe('useEntryStatusAccess ownership notice', () => {
  const notice = (role: string, unknown: boolean, online: boolean) => {
    own.unknown = unknown;
    own.online = online;
    const { result } = renderHook(() =>
      useEntryStatusAccess({ role, showId: 'show-1', selfCheckinFor: () => true })
    );
    return result.current.ownershipNotice;
  };

  it('tells an exhibitor it is still checking, or to connect when offline', () => {
    expect(notice('exhibitor', true, true)).toBe(OWNERSHIP_CHECKING_NOTICE);
    expect(notice('exhibitor', true, false)).toBe(OWNERSHIP_OFFLINE_NOTICE);
  });

  it('says nothing once ownership is known, and nothing to staff', () => {
    expect(notice('exhibitor', false, true)).toBeNull();
    expect(notice('admin', true, true)).toBeNull();
  });
});
