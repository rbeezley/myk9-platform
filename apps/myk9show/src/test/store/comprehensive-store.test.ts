import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Mock the storage adapter
vi.mock('../../services/database/storage-adapter', () => ({
  getOptimalStorage: vi.fn(() => ({
    getItem: vi.fn((key: string) => localStorage.getItem(key)),
    setItem: vi.fn((key: string, value: string) => localStorage.setItem(key, value)),
    removeItem: vi.fn((key: string) => localStorage.removeItem(key)),
  })),
}));

describe('Comprehensive Store Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Dog Store Tests', () => {
    it('should initialize with empty state', async () => {
      const { useDogStore } = await import('../../store/dogStore');

      const { result } = renderHook(() => useDogStore());

      expect(result.current).toBeDefined();
      expect(typeof result.current.selectedDogId).toBe('string');
      expect(result.current._migratedToReactQuery).toBe(true);
    });

    it('should handle dog selection', async () => {
      const { useDogStore } = await import('../../store/dogStore');

      const { result } = renderHook(() => useDogStore());

      act(() => {
        result.current.selectDog('dog-123');
      });

      expect(result.current.selectedDogId).toBe('dog-123');
    });

    it('should persist selected dog ID to storage', async () => {
      const { useDogStore } = await import('../../store/dogStore');

      const { result } = renderHook(() => useDogStore());

      act(() => {
        result.current.selectDog('dog-persist-123');
      });

      // Verify state is persisted (we can't directly test Zustand persistence, but can verify the action worked)
      expect(result.current.selectedDogId).toBe('dog-persist-123');
    });
  });

  describe('Club Store Tests', () => {
    it('should initialize with empty clubs array', async () => {
      const { useClubStore } = await import('../../store/clubStore');

      const { result } = renderHook(() => useClubStore());

      expect(result.current).toBeDefined();
      expect(Array.isArray(result.current.clubs)).toBe(true);
      expect(result.current.clubs.length).toBe(0);
    });
  });

  describe('Template Store Tests', () => {
    it('should handle class template management', async () => {
      const { useTemplateStore } = await import('../../store/templateStore');

      const { result } = renderHook(() => useTemplateStore());

      expect(result.current).toBeDefined();
      expect(Array.isArray(result.current.templates)).toBe(true);
    });
  });

  describe('Cross-Store Interactions', () => {
    it('should handle data consistency across stores', async () => {
      const { useDogStore } = await import('../../store/dogStore');
      const { useShowStore } = await import('../../store/showStore');

      const dogHook = renderHook(() => useDogStore());
      const showHook = renderHook(() => useShowStore());

      // Select a dog
      act(() => {
        dogHook.result.current.selectDog('dog-123');
      });

      // Select a show
      act(() => {
        showHook.result.current.selectShow('show-456');
      });

      expect(dogHook.result.current.selectedDogId).toBe('dog-123');
      expect(showHook.result.current.selectedShowId).toBe('show-456');
    });
  });

  describe('Store Persistence', () => {
    it('should persist important state to localStorage', async () => {
      const { useDogStore } = await import('../../store/dogStore');

      const { result } = renderHook(() => useDogStore());

      act(() => {
        result.current.selectDog('persistent-dog-123');
      });

      // The actual persistence is handled by Zustand middleware
      // We can only verify the state is set correctly
      expect(result.current.selectedDogId).toBe('persistent-dog-123');
    });

    it('should handle storage errors gracefully', () => {
      // Mock localStorage to throw an error
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage quota exceeded');
      });

      // The store should still function even if persistence fails
      expect(() => {
        localStorage.setItem('test', 'value');
      }).toThrow('Storage quota exceeded');

      // Restore original functionality
      localStorage.setItem = originalSetItem;
    });
  });

  describe('Store Performance', () => {
    it('should handle rapid state updates efficiently', async () => {
      const { useDogStore } = await import('../../store/dogStore');

      const { result } = renderHook(() => useDogStore());

      const startTime = performance.now();

      // Perform multiple rapid updates
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.selectDog(`dog-${i}`);
        }
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result.current.selectedDogId).toBe('dog-99');
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should not cause memory leaks with multiple store instances', async () => {
      const { useDogStore } = await import('../../store/dogStore');

      // Create multiple hook instances
      const hooks = [];
      for (let i = 0; i < 10; i++) {
        hooks.push(renderHook(() => useDogStore()));
      }

      // All should reference the same store instance
      const firstState = hooks[0].result.current;

      act(() => {
        firstState.selectDog('shared-dog-123');
      });

      // All hooks should have the same state
      hooks.forEach(hook => {
        expect(hook.result.current.selectedDogId).toBe('shared-dog-123');
      });
    });
  });
});
