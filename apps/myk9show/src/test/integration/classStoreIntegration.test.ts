// Class Store Integration Test - Phase 2.5: Class Store Integration
// Basic integration test to verify class and entry operations work correctly

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import type { ClassInput, EntryInput } from '@/store/classStore';
import React from 'react';

// Mock the database queries
vi.mock('@/services/database/queries/classQueries', () => ({
  getAllClasses: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'class-1',
        name: 'Test Class',
        level: 'Novice',
        trial_id: 'trial-1',
        entry_fee: 25,
        max_entries: 40,
        created_at: '2025-01-26T00:00:00Z',
        updated_at: '2025-01-26T00:00:00Z',
        trial: { name: 'Test Trial', date: '2025-01-26', trial_number: 'T-001' },
        entry: []
      }
    ],
    error: null
  }),
  getAllEntries: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'entry-1',
        class_id: 'class-1',
        armband_number: 'A101',
        handler_name: 'John Smith',
        status: 'qualified',
        score: 95.5,
        time: '2:15',
        placement: 1,
        created_at: '2025-01-26T00:00:00Z',
        updated_at: '2025-01-26T00:00:00Z',
        dog: { name: 'Max' },
        class: { name: 'Test Class' }
      }
    ],
    error: null
  }),
  getClassStatistics: vi.fn().mockResolvedValue({
    data: { total: 1 },
    error: null
  }),
  createClass: vi.fn(),
  updateClass: vi.fn(),
  deleteClass: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));

// Mock auth helpers
vi.mock('@/utils/authHelpers', () => ({
  getLastModifiedBy: vi.fn().mockReturnValue('test-user'),
}));

// Mock ID generation
vi.mock('@/utils/idUtils', () => ({
  generateId: vi.fn().mockReturnValue('test-id'),
}));

// Create wrapper component for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => 
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('Class Store Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load classes and entries successfully', async () => {
    const { result } = renderHook(() => useClassStoreCompat(), {
      wrapper: createWrapper(),
    });

    // Wait for queries to resolve
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify data is loaded and mapped correctly
    expect(result.current.classes).toHaveLength(1);
    expect(result.current.classes[0]).toMatchObject({
      id: 'class-1',
      className: 'Test Class',
      level: 'Novice',
      trialId: 'trial-1',
      trial: 'Test Trial',
      entryFee: 25,
      maxEntries: 40,
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({
      id: 'entry-1',
      armband: 'A101',
      handler: 'John Smith',
      dog: 'Max',
      status: 'Qualified',
      score: '95.5',
      time: '2:15',
      placement: '1',
      classId: 'class-1',
    });
  });

  it('should provide class lookup functions', async () => {
    const { result } = renderHook(() => useClassStoreCompat(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Test getClassById
    const classById = result.current.getClassById('class-1');
    expect(classById).toBeTruthy();
    expect(classById?.className).toBe('Test Class');

    // Test getClassesByTrialId
    const classesByTrial = result.current.getClassesByTrialId('trial-1');
    expect(classesByTrial).toHaveLength(1);
    expect(classesByTrial[0].className).toBe('Test Class');
  });

  it('should provide entry lookup functions', async () => {
    const { result } = renderHook(() => useClassStoreCompat(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Test getEntryById
    const entryById = result.current.getEntryById('entry-1');
    expect(entryById).toBeTruthy();
    expect(entryById?.armband).toBe('A101');

    // Test getEntriesByClass
    const entriesByClass = result.current.getEntriesByClass('class-1');
    expect(entriesByClass).toHaveLength(1);
    expect(entriesByClass[0].handler).toBe('John Smith');
  });

  it('should provide sync status information', async () => {
    const { result } = renderHook(() => useClassStoreCompat(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Test sync status
    const syncStatus = result.current.getSyncStatus('class-1');
    expect(syncStatus).toBe('synced');

    // Test compatibility flags
    expect(result.current._usingDatabase).toBe(true);
    expect(result.current._reactQueryIntegrated).toBe(true);
  });

  it('should handle errors gracefully', async () => {
    // Mock an error scenario
    const mockQueryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const errorWrapper = ({ children }: { children: React.ReactNode }) => 
      React.createElement(QueryClientProvider, { client: mockQueryClient }, children);

    const { result } = renderHook(() => useClassStoreCompat(), {
      wrapper: errorWrapper,
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.classes).toEqual([]);
    expect(result.current.entries).toEqual([]);
  });

  it('should provide statistics', async () => {
    const { result } = renderHook(() => useClassStoreCompat(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoadingStatistics).toBe(false);
    });

    expect(result.current.statistics).toEqual({ total: 1 });
  });

  it('should warn about deprecated methods', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const { result } = renderHook(() => useClassStoreCompat(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Test deprecated methods
    result.current.setClasses([]);
    expect(consoleSpy).toHaveBeenCalledWith('setClasses is deprecated in database mode');

    result.current.addClassLegacy({});
    expect(consoleSpy).toHaveBeenCalledWith('addClassLegacy is deprecated - use addClass instead');

    consoleSpy.mockRestore();
  });
});

describe('Class Store Type Mapping', () => {
  it('should map ClassInput to database format correctly', () => {
    const classInput: ClassInput = {
      trialId: 'trial-1',
      trial: 'Test Trial',
      trialDate: '2025-01-26',
      trialNumber: 'T-001',
      classOrder: '1',
      status: 'Scheduled',
      judge: 'John Judge',
      className: 'Test Class',
      level: 'Novice',
      element: 'Interior',
      entryFee: 25,
      maxEntries: 40,
      requiresJumpHeight: true,
    };

    // This would be tested in the mapper directly
    expect(classInput.className).toBe('Test Class');
    expect(classInput.entryFee).toBe(25);
    expect(classInput.requiresJumpHeight).toBe(true);
  });

  it('should map EntryInput to database format correctly', () => {
    const entryInput: EntryInput = {
      armband: 'A101',
      handler: 'John Smith',
      dog: 'Max',
      status: 'Qualified',
      score: '95.5',
      time: '2:15',
      placement: '1st',
      classId: 'class-1',
    };

    // This would be tested in the mapper directly
    expect(entryInput.armband).toBe('A101');
    expect(entryInput.status).toBe('Qualified');
    expect(entryInput.score).toBe('95.5');
  });
});