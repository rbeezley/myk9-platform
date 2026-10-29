import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCurrentPersonId } from './useCurrentPersonId';

let mockAuthPersonId: string | null | undefined;
let mockProfile: { person_id: string } | undefined;

vi.mock('./useAuthContext', () => ({
  useAuthContext: () => ({ personId: mockAuthPersonId }),
}));
vi.mock('./useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: mockProfile }),
}));

describe('useCurrentPersonId', () => {
  beforeEach(() => {
    mockAuthPersonId = undefined;
    mockProfile = undefined;
  });

  it('answers from the device-cached auth pairing when the exhibitor profile never loads (cold offline)', () => {
    mockAuthPersonId = 'person-cached';

    const { result } = renderHook(() => useCurrentPersonId());

    expect(result.current).toBe('person-cached');
  });

  it('falls back to the exhibitor profile when the auth pairing is unknown', () => {
    mockAuthPersonId = null;
    mockProfile = { person_id: 'person-profile' };

    const { result } = renderHook(() => useCurrentPersonId());

    expect(result.current).toBe('person-profile');
  });

  it('is undefined when neither source knows the person', () => {
    const { result } = renderHook(() => useCurrentPersonId());

    expect(result.current).toBeUndefined();
  });
});
