import { renderHook, act } from '@testing-library/react';
import { useColumnVisibility } from '../useColumnVisibility';

describe('useColumnVisibility', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty object when no stored state', () => {
    const { result } = renderHook(() => useColumnVisibility('test-table'));
    expect(result.current[0]).toEqual({});
  });

  it('reads stored state from localStorage on mount', () => {
    localStorage.setItem('datatable-cols-test-table', JSON.stringify({ col1: false }));
    const { result } = renderHook(() => useColumnVisibility('test-table'));
    expect(result.current[0]).toEqual({ col1: false });
  });

  it('writes to localStorage on change', () => {
    const { result } = renderHook(() => useColumnVisibility('test-table'));
    act(() => result.current[1]({ col1: false, col2: true }));
    expect(result.current[0]).toEqual({ col1: false, col2: true });
    expect(JSON.parse(localStorage.getItem('datatable-cols-test-table')!)).toEqual({
      col1: false,
      col2: true,
    });
  });

  it('returns empty object when tableId is undefined', () => {
    const { result } = renderHook(() => useColumnVisibility(undefined));
    expect(result.current[0]).toEqual({});
  });

  it('does not persist when tableId is undefined', () => {
    const { result } = renderHook(() => useColumnVisibility(undefined));
    act(() => result.current[1]({ col1: false }));
    expect(localStorage.length).toBe(0);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('datatable-cols-test-table', 'not-json');
    const { result } = renderHook(() => useColumnVisibility('test-table'));
    expect(result.current[0]).toEqual({});
  });

  describe('defaults', () => {
    it('starts from the defaults when nothing is stored', () => {
      const { result } = renderHook(() => useColumnVisibility('test-table', { status: false }));
      expect(result.current[0]).toEqual({ status: false });
    });

    it('merges a stored partial preference over the defaults', () => {
      // Saved before `status` gained a hidden default: it must stay hidden,
      // while the user's explicit choice to show `organization` still wins.
      localStorage.setItem('datatable-cols-test-table', JSON.stringify({ organization: true }));
      const { result } = renderHook(() =>
        useColumnVisibility('test-table', { organization: false, status: false })
      );
      expect(result.current[0]).toEqual({ organization: true, status: false });
    });

    it('falls back to the defaults on unreadable storage', () => {
      localStorage.setItem('datatable-cols-test-table', '[not-an-object]');
      const { result } = renderHook(() => useColumnVisibility('test-table', { status: false }));
      expect(result.current[0]).toEqual({ status: false });
    });
  });
});
