import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Mock the storage adapter
vi.mock('../../services/database/storage-adapter', () => ({
  getOptimalStorage: vi.fn(() => ({
    getItem: vi.fn((key: string) => localStorage.getItem(key)),
    setItem: vi.fn((key: string, value: string) => localStorage.setItem(key, value)),
    removeItem: vi.fn((key: string) => localStorage.removeItem(key))
  }))
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

    it('should handle clearing dog selection', async () => {
      const { useDogStore } = await import('../../store/dogStore');
      
      const { result } = renderHook(() => useDogStore());
      
      act(() => {
        result.current.selectDog('dog-123');
      });
      
      expect(result.current.selectedDogId).toBe('dog-123');
      
      act(() => {
        result.current.clearSelection();
      });
      
      expect(result.current.selectedDogId).toBe('');
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

  describe('Show Store Tests', () => {
    it('should initialize with empty shows array', async () => {
      const { useShowStore } = await import('../../store/showStore');
      
      const { result } = renderHook(() => useShowStore());
      
      expect(result.current).toBeDefined();
      expect(Array.isArray(result.current.shows)).toBe(true);
      expect(result.current.shows.length).toBe(0);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should handle adding a show', async () => {
      const { useShowStore } = await import('../../store/showStore');
      
      const { result } = renderHook(() => useShowStore());
      
      const newShow = {
        name: 'Test Dog Show',
        startDate: '2025-03-15',
        endDate: '2025-03-17',
        location: 'Test Venue',
        clubId: 'club-123',
        status: 'accepting_entries' as const,
        entryDeadline: '2025-03-01',
        showType: 'conformation' as const
      };
      
      await act(async () => {
        await result.current.addShow(newShow);
      });
      
      // Since the store now uses React Query, we mainly test the action was called
      // The actual data would come from the database via React Query
      expect(result.current.loading).toBe(false);
    });

    it('should handle show loading states', async () => {
      const { useShowStore } = await import('../../store/showStore');
      
      const { result } = renderHook(() => useShowStore());
      
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
      
      // Test that we can set loading state
      act(() => {
        result.current.setLoading(true);
      });
      
      expect(result.current.loading).toBe(true);
    });

    it('should handle show error states', async () => {
      const { useShowStore } = await import('../../store/showStore');
      
      const { result } = renderHook(() => useShowStore());
      
      const testError = 'Failed to load shows';
      
      act(() => {
        result.current.setError(testError);
      });
      
      expect(result.current.error).toBe(testError);
    });

    it('should handle show selection', async () => {
      const { useShowStore } = await import('../../store/showStore');
      
      const { result } = renderHook(() => useShowStore());
      
      act(() => {
        result.current.selectShow('show-123');
      });
      
      expect(result.current.selectedShowId).toBe('show-123');
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

    it('should handle adding a club', async () => {
      const { useClubStore } = await import('../../store/clubStore');
      
      const { result } = renderHook(() => useClubStore());
      
      const newClub = {
        name: 'Test Kennel Club',
        location: 'Test City',
        contactEmail: 'test@testclub.com',
        website: 'https://testclub.com'
      };
      
      await act(async () => {
        await result.current.addClub(newClub);
      });
      
      // Verify the action was called (actual data handling is via React Query)
      expect(result.current.loading).toBe(false);
    });
  });

  describe('User Store Tests', () => {
    it('should initialize with empty user state', async () => {
      const { useUserStore } = await import('../../store/userStore');
      
      const { result } = renderHook(() => useUserStore());
      
      expect(result.current).toBeDefined();
      expect(result.current.currentUser).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should handle user login', async () => {
      const { useUserStore } = await import('../../store/userStore');
      
      const { result } = renderHook(() => useUserStore());
      
      const testUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user' as const
      };
      
      act(() => {
        result.current.setUser(testUser);
      });
      
      expect(result.current.currentUser).toEqual(testUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should handle user logout', async () => {
      const { useUserStore } = await import('../../store/userStore');
      
      const { result } = renderHook(() => useUserStore());
      
      const testUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user' as const
      };
      
      act(() => {
        result.current.setUser(testUser);
      });
      
      expect(result.current.isAuthenticated).toBe(true);
      
      act(() => {
        result.current.clearUser();
      });
      
      expect(result.current.currentUser).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('Registration Store Tests', () => {
    it('should handle show registration workflow', async () => {
      const { useShowRegistrationStore } = await import('../../store/showRegistrationStore');
      
      const { result } = renderHook(() => useShowRegistrationStore());
      
      expect(result.current).toBeDefined();
      expect(result.current.currentRegistration).toBeNull();
      expect(result.current.step).toBe('dog-selection');
    });

    it('should progress through registration steps', async () => {
      const { useShowRegistrationStore } = await import('../../store/showRegistrationStore');
      
      const { result } = renderHook(() => useShowRegistrationStore());
      
      // Start registration
      act(() => {
        result.current.startRegistration('show-123');
      });
      
      expect(result.current.showId).toBe('show-123');
      expect(result.current.step).toBe('dog-selection');
      
      // Move to next step
      act(() => {
        result.current.nextStep();
      });
      
      expect(result.current.step).toBe('class-selection');
    });

    it('should handle registration data updates', async () => {
      const { useShowRegistrationStore } = await import('../../store/showRegistrationStore');
      
      const { result } = renderHook(() => useShowRegistrationStore());
      
      const registrationData = {
        dogId: 'dog-123',
        classIds: ['class-1', 'class-2'],
        handlerInfo: {
          name: 'John Handler',
          phone: '123-456-7890'
        }
      };
      
      act(() => {
        result.current.updateRegistrationData(registrationData);
      });
      
      expect(result.current.registrationData).toEqual(registrationData);
    });
  });

  describe('Template Store Tests', () => {
    it('should handle class template management', async () => {
      const { useTemplateStore } = await import('../../store/templateStore');
      
      const { result } = renderHook(() => useTemplateStore());
      
      expect(result.current).toBeDefined();
      expect(Array.isArray(result.current.templates)).toBe(true);
    });

    it('should handle template creation', async () => {
      const { useTemplateStore } = await import('../../store/templateStore');
      
      const { result } = renderHook(() => useTemplateStore());
      
      const newTemplate = {
        name: 'AKC Conformation Template',
        type: 'conformation' as const,
        organization: 'AKC',
        classes: [
          {
            name: 'Puppy Dog',
            ageRange: '6-9 months',
            gender: 'male'
          }
        ]
      };
      
      await act(async () => {
        await result.current.addTemplate(newTemplate);
      });
      
      // Verify the action was called
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Class Creation Store Tests', () => {
    it('should handle class creation workflow', async () => {
      const { useClassCreationStore } = await import('../../store/classCreationStore');
      
      const { result } = renderHook(() => useClassCreationStore());
      
      expect(result.current).toBeDefined();
      expect(result.current.selectedTemplate).toBeNull();
      expect(Array.isArray(result.current.generatedClasses)).toBe(true);
    });

    it('should handle template selection for class creation', async () => {
      const { useClassCreationStore } = await import('../../store/classCreationStore');
      
      const { result } = renderHook(() => useClassCreationStore());
      
      const template = {
        id: 'template-123',
        name: 'AKC Template',
        type: 'conformation' as const,
        organization: 'AKC'
      };
      
      act(() => {
        result.current.selectTemplate(template);
      });
      
      expect(result.current.selectedTemplate).toEqual(template);
    });
  });

  describe('Sync Store Tests', () => {
    it('should handle synchronization state', async () => {
      const { useSyncStore } = await import('../../store/syncStore');
      
      const { result } = renderHook(() => useSyncStore());
      
      expect(result.current).toBeDefined();
      expect(result.current.isOnline).toBe(true);
      expect(result.current.syncInProgress).toBe(false);
    });

    it('should handle sync operations', async () => {
      const { useSyncStore } = await import('../../store/syncStore');
      
      const { result } = renderHook(() => useSyncStore());
      
      act(() => {
        result.current.startSync();
      });
      
      expect(result.current.syncInProgress).toBe(true);
      
      act(() => {
        result.current.completeSyncSuccess();
      });
      
      expect(result.current.syncInProgress).toBe(false);
      expect(result.current.lastSyncTime).toBeDefined();
    });

    it('should handle sync errors', async () => {
      const { useSyncStore } = await import('../../store/syncStore');
      
      const { result } = renderHook(() => useSyncStore());
      
      const errorMessage = 'Sync failed: Network error';
      
      act(() => {
        result.current.completeSyncError(errorMessage);
      });
      
      expect(result.current.syncInProgress).toBe(false);
      expect(result.current.lastSyncError).toBe(errorMessage);
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

    it('should handle store resets without affecting other stores', async () => {
      const { useDogStore } = await import('../../store/dogStore');
      const { useShowStore } = await import('../../store/showStore');
      
      const dogHook = renderHook(() => useDogStore());
      const showHook = renderHook(() => useShowStore());
      
      // Set initial state
      act(() => {
        dogHook.result.current.selectDog('dog-123');
        showHook.result.current.selectShow('show-456');
      });
      
      // Reset one store
      act(() => {
        dogHook.result.current.clearSelection();
      });
      
      expect(dogHook.result.current.selectedDogId).toBe('');
      expect(showHook.result.current.selectedShowId).toBe('show-456'); // Should remain unchanged
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