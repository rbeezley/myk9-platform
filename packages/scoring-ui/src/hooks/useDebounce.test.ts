import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('should not update the value before the delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 300 } }
    );

    rerender({ value: 'world', delay: 300 });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Should still be the old value
    expect(result.current).toBe('hello');
  });

  it('should update the value after the delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 300 } }
    );

    rerender({ value: 'world', delay: 300 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('world');
  });

  it('should reset the timer when value changes before delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    );

    rerender({ value: 'b', delay: 300 });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Change again before delay expires
    rerender({ value: 'c', delay: 300 });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Should still be 'a' because the 300ms hasn't elapsed since 'c' was set
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Now 300ms has passed since 'c' was set
    expect(result.current).toBe('c');
  });

  it('should use default delay of 300ms', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 'hello' } }
    );

    rerender({ value: 'world' });

    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(result.current).toBe('hello');

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current).toBe('world');
  });

  it('should work with numbers', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 0, delay: 100 } }
    );

    rerender({ value: 42, delay: 100 });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe(42);
  });
});
