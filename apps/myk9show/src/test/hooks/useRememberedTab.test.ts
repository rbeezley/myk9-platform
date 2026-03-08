import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRememberedTab } from '@/hooks/useRememberedTab';

describe('useRememberedTab', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Default tab behavior', () => {
    it('should return the default tab on first load', () => {
      const { result } = renderHook(() => useRememberedTab('dogs', 'overview'));

      expect(result.current[0]).toBe('overview');
    });

    it('should return different defaults for different pages', () => {
      const { result: result1 } = renderHook(() => useRememberedTab('dogs', 'overview'));
      const { result: result2 } = renderHook(() => useRememberedTab('shows', 'upcoming'));

      expect(result1.current[0]).toBe('overview');
      expect(result2.current[0]).toBe('upcoming');
    });
  });

  describe('Persisting tab changes', () => {
    it('should persist tab changes to localStorage', () => {
      const { result } = renderHook(() => useRememberedTab('dogs', 'overview'));

      act(() => {
        result.current[1]('health');
      });

      expect(result.current[0]).toBe('health');
      expect(localStorage.getItem('myk9:tab:dogs')).toBe('health');
    });

    it('should update state when setActiveTab is called', () => {
      const { result } = renderHook(() => useRememberedTab('dogs', 'overview'));

      act(() => {
        result.current[1]('pedigree');
      });

      expect(result.current[0]).toBe('pedigree');

      act(() => {
        result.current[1]('titles');
      });

      expect(result.current[0]).toBe('titles');
    });
  });

  describe('Reading persisted value on init', () => {
    it('should read persisted value from localStorage', () => {
      localStorage.setItem('myk9:tab:dogs', 'health');

      const { result } = renderHook(() => useRememberedTab('dogs', 'overview'));

      expect(result.current[0]).toBe('health');
    });

    it('should use default when localStorage has no value for this key', () => {
      localStorage.setItem('myk9:tab:other-page', 'something');

      const { result } = renderHook(() => useRememberedTab('dogs', 'overview'));

      expect(result.current[0]).toBe('overview');
    });

    it('should use page-scoped storage keys', () => {
      localStorage.setItem('myk9:tab:dogs', 'health');
      localStorage.setItem('myk9:tab:shows', 'past');

      const { result: dogsResult } = renderHook(() => useRememberedTab('dogs', 'overview'));
      const { result: showsResult } = renderHook(() => useRememberedTab('shows', 'upcoming'));

      expect(dogsResult.current[0]).toBe('health');
      expect(showsResult.current[0]).toBe('past');
    });
  });

  describe('Handling corrupt localStorage', () => {
    it('should fall back to default when localStorage.getItem throws', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const { result } = renderHook(() => useRememberedTab('dogs', 'overview'));

      expect(result.current[0]).toBe('overview');

      getItemSpy.mockRestore();
    });

    it('should handle localStorage.setItem throwing gracefully', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const { result } = renderHook(() => useRememberedTab('dogs', 'overview'));

      act(() => {
        result.current[1]('health');
      });

      // State should still update even if localStorage write fails
      expect(result.current[0]).toBe('health');

      setItemSpy.mockRestore();
    });
  });

  describe('Function stability', () => {
    it('should maintain setActiveTab reference between renders', () => {
      const { result, rerender } = renderHook(() => useRememberedTab('dogs', 'overview'));

      const initialSetter = result.current[1];

      rerender();

      expect(result.current[1]).toBe(initialSetter);
    });
  });

  describe('Return type', () => {
    it('should return a tuple of [string, function]', () => {
      const { result } = renderHook(() => useRememberedTab('dogs', 'overview'));

      expect(typeof result.current[0]).toBe('string');
      expect(typeof result.current[1]).toBe('function');
    });
  });
});
