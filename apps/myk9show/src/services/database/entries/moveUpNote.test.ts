import { describe, expect, it } from 'vitest';

import {
  MOVED_UP_FROM_PATTERN,
  buildMovedUpFromNote,
  parseMovedUpFromClassId,
} from './moveUpNote';

describe('moveUpNote', () => {
  it('builds the canonical note without a reason', () => {
    expect(buildMovedUpFromNote('class-1')).toBe('Moved up from class class-1');
  });

  it('builds the canonical note with a reason appended', () => {
    expect(buildMovedUpFromNote('class-1', 'Qualified today')).toBe(
      'Moved up from class class-1: Qualified today'
    );
  });

  it('round-trips the source class id through build → parse', () => {
    const id = 'a1b2c3d4-0000-4000-8000-000000000000';
    expect(parseMovedUpFromClassId(buildMovedUpFromNote(id))).toBe(id);
  });

  it('round-trips the source class id even when a reason is appended', () => {
    const id = 'a1b2c3d4-0000-4000-8000-000000000000';
    expect(parseMovedUpFromClassId(buildMovedUpFromNote(id, 'moved up by steward'))).toBe(id);
  });

  it('stringifies a missing class id, matching the prior inline-template behavior', () => {
    // INTENT: call sites pass a nullable class id (`classId ?? class_id`); the
    // builder coerces rather than throwing, exactly as the old `${id}` template
    // did. In practice a fetched entry always has a class id.
    expect(buildMovedUpFromNote(undefined)).toBe('Moved up from class undefined');
    expect(buildMovedUpFromNote(null)).toBe('Moved up from class null');
  });

  it('returns null for input that is not a move-up note', () => {
    expect(parseMovedUpFromClassId('Moved up to Open Standard')).toBeNull();
    expect(parseMovedUpFromClassId('')).toBeNull();
    expect(parseMovedUpFromClassId(null)).toBeNull();
    expect(parseMovedUpFromClassId(undefined)).toBeNull();
  });

  it('exposes a single shared pattern that captures the class id', () => {
    const match = 'Moved up from class class-1: reason'.match(MOVED_UP_FROM_PATTERN);
    expect(match?.[1]).toBe('class-1');
  });
});
