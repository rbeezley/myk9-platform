import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useViewPreference } from '@/hooks/useViewPreference';
import { defaultListView } from '@/utils/defaultListView';

describe('useViewPreference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default mode when localStorage is empty', () => {
    const { result } = renderHook(() => useViewPreference('classes', 'table'));
    expect(result.current[0]).toBe('table');
    expect(result.current[2]).toBe(false);
  });

  it('reads persisted value from localStorage', () => {
    localStorage.setItem('view-pref-classes', 'cards');
    const { result } = renderHook(() => useViewPreference('classes', 'table'));
    expect(result.current[0]).toBe('cards');
    expect(result.current[2]).toBe(true);
  });

  it('updates an unsaved mode when the default changes', () => {
    const { result, rerender } = renderHook(
      ({ defaultMode }: { defaultMode: 'cards' | 'table' }) =>
        useViewPreference('dogs', defaultMode),
      { initialProps: { defaultMode: 'table' } as { defaultMode: 'cards' | 'table' } }
    );

    expect(result.current[0]).toBe('table');

    rerender({ defaultMode: 'cards' as const });

    expect(result.current[0]).toBe('cards');
    expect(result.current[2]).toBe(false);
  });

  it('keeps a stored mode when the default changes', () => {
    localStorage.setItem('view-pref-dogs', 'table');
    const { result, rerender } = renderHook(
      ({ defaultMode }) => useViewPreference('dogs', defaultMode),
      { initialProps: { defaultMode: 'cards' as const } }
    );

    expect(result.current[0]).toBe('table');

    rerender({ defaultMode: 'cards' as const });

    expect(result.current[0]).toBe('table');
    expect(result.current[2]).toBe(true);
  });

  it('writes to localStorage on change', () => {
    const { result } = renderHook(() => useViewPreference('classes', 'table'));
    act(() => result.current[1]('cards'));
    expect(result.current[0]).toBe('cards');
    expect(result.current[2]).toBe(true);
    expect(localStorage.getItem('view-pref-classes')).toBe('cards');
  });

  it('isolates keys between tabs', () => {
    localStorage.setItem('view-pref-trials', 'table');
    const { result } = renderHook(() => useViewPreference('classes', 'cards'));
    expect(result.current[0]).toBe('cards');
  });

  it('ignores invalid localStorage values and falls back to default', () => {
    localStorage.setItem('view-pref-classes', 'kanban');
    const { result } = renderHook(() => useViewPreference('classes', 'table'));
    expect(result.current[0]).toBe('table');
  });

  // MYK9-929 / owner decision 8: staff lists open on a table, exhibitor and public lists on cards.
  it('defaults staff lists to table and exhibitor or public lists to cards', () => {
    expect(defaultListView(true)).toBe('table');
    expect(defaultListView(false)).toBe('cards');
  });

  it('remembers modes beyond cards and table when the list offers them', () => {
    const { result } = renderHook(() =>
      useViewPreference('shows-find', 'cards', ['cards', 'table', 'calendar', 'map'])
    );
    act(() => result.current[1]('calendar'));
    expect(result.current[0]).toBe('calendar');
    expect(localStorage.getItem('view-pref-shows-find')).toBe('calendar');
  });

  it('re-reads the remembered choice when the key changes (a list with two tabs)', () => {
    localStorage.setItem('view-pref-shows-managing', 'cards');
    const { result, rerender } = renderHook(
      ({ tabKey }: { tabKey: string }) => useViewPreference(tabKey, 'table'),
      { initialProps: { tabKey: 'shows-find' } }
    );
    expect(result.current[0]).toBe('table');
    rerender({ tabKey: 'shows-managing' });
    expect(result.current[0]).toBe('cards');
    expect(result.current[2]).toBe(true);
  });
});
