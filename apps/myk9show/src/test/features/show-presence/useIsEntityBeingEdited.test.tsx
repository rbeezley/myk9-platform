import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  ShowPresenceContext,
  type ShowPresenceContextValue,
} from '@/features/show-presence/showPresenceContext';
import { useIsEntityBeingEdited } from '@/features/show-presence/useIsEntityBeingEdited';
import type { ShowPresence } from '@/features/show-presence/types';

const mk = (over: Partial<ShowPresence>): ShowPresence => ({
  userId: 'u',
  name: 'Someone',
  role: 'secretary',
  location: { page: '' },
  activity: 'editing',
  ts: 1,
  ...over,
});

const jane = mk({
  userId: 'her',
  name: 'Jane',
  editing: { entityType: 'entry', entityId: 'e1' },
});

const wrapperFor =
  (value: ShowPresenceContextValue) =>
  ({ children }: { children: ReactNode }) => (
    <ShowPresenceContext.Provider value={value}>{children}</ShowPresenceContext.Provider>
  );

describe('useIsEntityBeingEdited', () => {
  it('is true with the editor name when another user edits the same entity', () => {
    const { result } = renderHook(() => useIsEntityBeingEdited('entry', 'e1'), {
      wrapper: wrapperFor({ present: [jane], viewerId: 'me' }),
    });
    expect(result.current).toEqual({ isEditing: true, editorName: 'Jane' });
  });

  it('is false when only the viewer is editing the entity', () => {
    const me = mk({ userId: 'me', name: 'Me', editing: { entityType: 'entry', entityId: 'e1' } });
    const { result } = renderHook(() => useIsEntityBeingEdited('entry', 'e1'), {
      wrapper: wrapperFor({ present: [me], viewerId: 'me' }),
    });
    expect(result.current).toEqual({ isEditing: false, editorName: null });
  });

  it('is false when nobody is editing', () => {
    const { result } = renderHook(() => useIsEntityBeingEdited('entry', 'e1'), {
      wrapper: wrapperFor({ present: [mk({ userId: 'her', name: 'Jane' })], viewerId: 'me' }),
    });
    expect(result.current).toEqual({ isEditing: false, editorName: null });
  });

  it('degrades to false outside a ShowPresenceProvider (empty roster)', () => {
    const { result } = renderHook(() => useIsEntityBeingEdited('entry', 'e1'));
    expect(result.current).toEqual({ isEditing: false, editorName: null });
  });
});
