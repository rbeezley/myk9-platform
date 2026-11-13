/**
 * MYK9-1807: the combined A and B list asks each dog's OWN class whether self check-in is on,
 * because that is what the server's `self_checkin_entry` does.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Entry } from '@myk9/ringside';
import { useEntryStatusAccess } from './useEntryStatusAccess';

const dog = (id: string, classId: string): Entry => ({ id, classId }) as unknown as Entry;
const dogA = dog('a', 'class-a');
const dogB = dog('b', 'class-b');
const ownBoth = new Set(['a', 'b']);

function controls(role: string | null, off: string[]) {
  const { result } = renderHook(() =>
    useEntryStatusAccess({
      role,
      ownEntryIds: ownBoth,
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
