import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useMineToggle } from '@/hooks/useMineToggle';

describe('useMineToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to "all" when no defaultMine', () => {
    const { result } = renderHook(() => useMineToggle('shows'));
    expect(result.current.isMine).toBe(false);
  });

  it('defaults to "mine" when defaultMine is true', () => {
    const { result } = renderHook(() => useMineToggle('classes', true));
    expect(result.current.isMine).toBe(true);
  });

  it('toggles between all and mine', () => {
    const { result } = renderHook(() => useMineToggle('shows'));
    expect(result.current.isMine).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.isMine).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isMine).toBe(false);
  });

  it('persists preference to localStorage', () => {
    const { result } = renderHook(() => useMineToggle('shows'));
    act(() => result.current.toggle());
    expect(localStorage.getItem('myk9-mine-toggle-shows')).toBe('true');
  });

  it('reads persisted preference on mount', () => {
    localStorage.setItem('myk9-mine-toggle-shows', 'true');
    const { result } = renderHook(() => useMineToggle('shows'));
    expect(result.current.isMine).toBe(true);
  });
});
