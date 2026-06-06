import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useViewPreference } from '@/hooks/useViewPreference';

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
});
