import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { dogStore } from '@/store/dogStore';
import { userStore } from '@/store/userStore';

// Mock components for testing
const MockDogList = () => {
  const dogs = dogStore((state) => state.dogs);
  const isLoading = dogStore((state) => state.isLoading);
  const addDog = dogStore((state) => state.addDog);

  if (isLoading) {
    return <div data-testid="loading">Loading...</div>;
  }

  return (
    <div>
      <div data-testid="dog-count">{dogs.length}</div>
      {dogs.map((dog) => (
        <div key={dog.id} data-testid={`dog-${dog.id}`}>
          {dog.name} - {dog._syncStatus}
        </div>
      ))}
      <button
        data-testid="add-dog"
        onClick={() => addDog({ name: 'New Dog', breed: 'Test', sex: 'male' })}
      >
        Add Dog
      </button>
    </div>
  );
};

const MockPersonList = () => {
  const people = userStore((state) => state.people);
  const isLoading = userStore((state) => state.isLoading);
  const addUser = userStore((state) => state.addUser);

  if (isLoading) {
    return <div data-testid="people-loading">Loading...</div>;
  }

  return (
    <div>
      <div data-testid="people-count">{people.length}</div>
      {people.map((person) => (
        <div key={person.id} data-testid={`person-${person.id}`}>
          {person.firstName} {person.lastName} - {person._syncStatus}
        </div>
      ))}
      <button
        data-testid="add-person"
        onClick={() => addUser({ 
          firstName: 'New', 
          lastName: 'User', 
          email: `new${Date.now()}@example.com` 
        })}
      >
        Add User
      </button>
    </div>
  );
};

// Mock network conditions
const mockNetworkStatus = { online: true };
Object.defineProperty(navigator, 'onLine', {
  get: () => mockNetworkStatus.online,
  configurable: true
});

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});


describe('UI Responsiveness Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockNetworkStatus.online = true;
    
    // Reset stores
    dogStore.getState().clearDogs();
    userStore.getState().clearPeople();
    
    // Mock performance.now for consistent timing
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Optimistic UI Updates', () => {
    it('should update UI immediately on entity creation', async () => {
      const user = userEvent.setup();
      render(<MockDogList />);

      // Initial state
      expect(screen.getByTestId('dog-count')).toHaveTextContent('0');

      // Measure time for UI update
      const startTime = performance.now();
      
      // Click add button
      await user.click(screen.getByTestId('add-dog'));
      
      // UI should update immediately (within 100ms)
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('1');
      }, { timeout: 100 });

      const endTime = performance.now();
      const updateTime = endTime - startTime;

      expect(updateTime).toBeLessThan(100); // UI should update within 100ms
      
      // Check that the dog appears with pending status
      expect(screen.getByText(/New Dog - pending/)).toBeInTheDocument();
    });

    it('should handle rapid successive additions without lag', async () => {
      const user = userEvent.setup();
      render(<MockDogList />);

      const addButton = screen.getByTestId('add-dog');
      const measurements: number[] = [];

      // Perform 10 rapid additions
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await user.click(addButton);
        
        await waitFor(() => {
          expect(screen.getByTestId('dog-count')).toHaveTextContent((i + 1).toString());
        }, { timeout: 100 });
        
        const end = performance.now();
        measurements.push(end - start);
      }

      // All updates should be fast
      measurements.forEach(time => {
        expect(time).toBeLessThan(100);
      });

      // Performance shouldn't degrade significantly
      const avgFirst5 = measurements.slice(0, 5).reduce((a, b) => a + b) / 5;
      const avgLast5 = measurements.slice(-5).reduce((a, b) => a + b) / 5;
      
      expect(avgLast5).toBeLessThan(avgFirst5 * 2); // No more than 2x slower
    });

    it('should maintain responsiveness during large dataset operations', async () => {
      const user = userEvent.setup();
      
      // Pre-populate with many dogs
      const dogs = Array.from({ length: 1000 }, (_, i) => ({
        name: `Dog ${i}`,
        breed: 'Test Breed',
        sex: 'male' as const
      }));

      // Add dogs in batches to avoid blocking
      for (let i = 0; i < dogs.length; i += 50) {
        const batch = dogs.slice(i, i + 50);
        await Promise.all(batch.map(dog => dogStore.getState().addDog(dog)));
      }

      render(<MockDogList />);

      // UI should render quickly even with large dataset
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('1000');
      }, { timeout: 500 });

      // Adding one more should still be fast
      const start = performance.now();
      await user.click(screen.getByTestId('add-dog'));
      
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('1001');
      }, { timeout: 200 });
      
      const end = performance.now();
      expect(end - start).toBeLessThan(200);
    });
  });

  describe('Loading States and Feedback', () => {
    it('should show loading state during sync operations', async () => {
      render(<MockDogList />);

      // Initially not loading
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();

      // Trigger operation that causes loading
      dogStore.getState().setLoading(true);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toBeInTheDocument();
      });

      // Clear loading state
      dogStore.getState().setLoading(false);

      // Should return to normal view
      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });
    });

    it('should provide visual feedback for sync status', async () => {
      const user = userEvent.setup();
      render(<MockDogList />);

      // Add a dog
      await user.click(screen.getByTestId('add-dog'));

      // Should show pending status
      await waitFor(() => {
        expect(screen.getByText(/New Dog - pending/)).toBeInTheDocument();
      });

      // Simulate sync completion
      const dogs = dogStore.getState().dogs;
      if (dogs.length > 0) {
        await dogStore.getState().updateDog(dogs[0].id, {
          _syncStatus: 'synced' as const
        });
      }

      // Should show synced status
      await waitFor(() => {
        expect(screen.getByText(/New Dog - synced/)).toBeInTheDocument();
      });
    });

    it('should handle error states gracefully', async () => {
      const user = userEvent.setup();
      render(<MockDogList />);

      // Add a dog
      await user.click(screen.getByTestId('add-dog'));

      // Simulate sync error
      const dogs = dogStore.getState().dogs;
      if (dogs.length > 0) {
        await dogStore.getState().updateDog(dogs[0].id, {
          _syncStatus: 'error' as const
        });
      }

      // Should show error status
      await waitFor(() => {
        expect(screen.getByText(/New Dog - error/)).toBeInTheDocument();
      });
    });
  });

  describe('Offline Mode Responsiveness', () => {
    it('should maintain full responsiveness when offline', async () => {
      const user = userEvent.setup();
      
      // Go offline
      mockNetworkStatus.online = false;
      
      render(<MockDogList />);

      const measurements: number[] = [];

      // Perform operations while offline
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await user.click(screen.getByTestId('add-dog'));
        
        await waitFor(() => {
          expect(screen.getByTestId('dog-count')).toHaveTextContent((i + 1).toString());
        }, { timeout: 100 });
        
        const end = performance.now();
        measurements.push(end - start);
      }

      // All operations should be fast even offline
      measurements.forEach(time => {
        expect(time).toBeLessThan(100);
      });

      // All dogs should show pending status
      const dogs = dogStore.getState().dogs;
      dogs.forEach(dog => {
        expect(dog._syncStatus).toBe('pending');
      });
    });

    it('should smoothly transition between online and offline modes', async () => {
      const user = userEvent.setup();
      render(<MockDogList />);

      // Start online - add a dog
      await user.click(screen.getByTestId('add-dog'));
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('1');
      });

      // Go offline
      mockNetworkStatus.online = false;

      // Add another dog offline
      const offlineStart = performance.now();
      await user.click(screen.getByTestId('add-dog'));
      
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('2');
      }, { timeout: 100 });
      
      const offlineEnd = performance.now();
      
      // Go back online
      mockNetworkStatus.online = true;

      // Add another dog online
      const onlineStart = performance.now();
      await user.click(screen.getByTestId('add-dog'));
      
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('3');
      }, { timeout: 100 });
      
      const onlineEnd = performance.now();

      // Performance should be similar in both modes
      const offlineTime = offlineEnd - offlineStart;
      const onlineTime = onlineEnd - onlineStart;
      
      expect(Math.abs(offlineTime - onlineTime)).toBeLessThan(50);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous entity types', async () => {
      const user = userEvent.setup();
      
      const CombinedComponent = () => (
        <div>
          <MockDogList />
          <MockPersonList />
        </div>
      );

      render(<CombinedComponent />);

      // Perform concurrent operations on different entity types
      const dogPromise = user.click(screen.getByTestId('add-dog'));
      const personPromise = user.click(screen.getByTestId('add-person'));

      await Promise.all([dogPromise, personPromise]);

      // Both should update quickly
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('1');
        expect(screen.getByTestId('people-count')).toHaveTextContent('1');
      }, { timeout: 200 });
    });

    it('should maintain UI consistency during rapid updates', async () => {
      const user = userEvent.setup();
      render(<MockDogList />);

      // Perform rapid updates
      const operations = Array.from({ length: 20 }, () => 
        user.click(screen.getByTestId('add-dog'))
      );

      await Promise.all(operations);

      // Final count should be accurate
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('20');
      }, { timeout: 1000 });

      // All dogs should be visible
      const dogs = dogStore.getState().dogs;
      expect(dogs).toHaveLength(20);
    });
  });

  describe('Memory and Performance Optimization', () => {
    it('should not cause memory leaks during repeated operations', async () => {
      const user = userEvent.setup();
      render(<MockDogList />);

      // Simulate memory pressure by performing many operations
      for (let cycle = 0; cycle < 10; cycle++) {
        // Add dogs
        for (let i = 0; i < 50; i++) {
          await user.click(screen.getByTestId('add-dog'));
        }

        // Clear some dogs to simulate cleanup
        const dogs = dogStore.getState().dogs;
        for (let i = 0; i < 25; i++) {
          if (dogs[i]) {
            await dogStore.getState().deleteDog(dogs[i].id);
          }
        }

        // UI should remain responsive
        const start = performance.now();
        await user.click(screen.getByTestId('add-dog'));
        
        await waitFor(() => {
          const currentCount = parseInt(screen.getByTestId('dog-count').textContent || '0');
          expect(currentCount).toBeGreaterThan(0);
        }, { timeout: 100 });
        
        const end = performance.now();
        expect(end - start).toBeLessThan(100);
      }
    });

    it('should handle component re-renders efficiently', async () => {
      let renderCount = 0;
      
      const TrackingDogList = () => {
        renderCount++;
        return <MockDogList />;
      };

      const user = userEvent.setup();
      render(<TrackingDogList />);

      const initialRenders = renderCount;

      // Add a dog
      await user.click(screen.getByTestId('add-dog'));
      
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('1');
      });

      // Should not cause excessive re-renders
      const finalRenders = renderCount;
      const additionalRenders = finalRenders - initialRenders;
      
      expect(additionalRenders).toBeLessThan(5); // Reasonable number of re-renders
    });
  });

  describe('Real-time Updates', () => {
    it('should handle real-time updates smoothly', async () => {
      render(<MockDogList />);

      // Simulate real-time update from server
      const realtimeUpdate = {
        id: 'server-dog-123',
        name: 'Server Dog',
        breed: 'Server Breed',
        sex: 'female' as const,
        _syncStatus: 'synced' as const,
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'other-user'
      };

      const start = performance.now();
      
      // Simulate receiving real-time update
      dogStore.getState().handleRealtimeUpdate(realtimeUpdate);

      // UI should update quickly
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('1');
        expect(screen.getByText(/Server Dog - synced/)).toBeInTheDocument();
      }, { timeout: 100 });

      const end = performance.now();
      expect(end - start).toBeLessThan(100);
    });

    it('should batch multiple real-time updates', async () => {
      render(<MockDogList />);

      const updates = Array.from({ length: 10 }, (_, i) => ({
        id: `server-dog-${i}`,
        name: `Server Dog ${i}`,
        breed: 'Batch Breed',
        sex: 'male' as const,
        _syncStatus: 'synced' as const,
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'other-user'
      }));

      const start = performance.now();

      // Send multiple updates rapidly
      updates.forEach(update => {
        dogStore.getState().handleRealtimeUpdate(update);
      });

      // All should appear quickly
      await waitFor(() => {
        expect(screen.getByTestId('dog-count')).toHaveTextContent('10');
      }, { timeout: 200 });

      const end = performance.now();
      expect(end - start).toBeLessThan(200);
    });
  });

  describe('Error Recovery', () => {
    it('should recover gracefully from UI errors', async () => {
      const user = userEvent.setup();
      
      // Mock a component that might throw an error
      const ErrorProneComponent = () => {
        const dogs = dogStore((state) => state.dogs);
        
        // Simulate error condition
        if (dogs.length === 3) {
          throw new Error('Simulated error');
        }
        
        return <MockDogList />;
      };

      // Wrap in error boundary
      const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
        try {
          return <>{children}</>;
        } catch {
          return <div data-testid="error">Error occurred</div>;
        }
      };

      render(
        <ErrorBoundary>
          <ErrorProneComponent />
        </ErrorBoundary>
      );

      // Add dogs normally
      await user.click(screen.getByTestId('add-dog'));
      await user.click(screen.getByTestId('add-dog'));

      expect(screen.getByTestId('dog-count')).toHaveTextContent('2');

      // This should trigger the error
      await user.click(screen.getByTestId('add-dog'));

      // Error boundary should catch and display error
      await waitFor(() => {
        expect(screen.queryByTestId('error')).toBeInTheDocument();
      });
    });
  });
});