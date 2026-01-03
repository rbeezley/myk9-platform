/**
 * Tests for entry store
 */

import { vi } from 'vitest';
import { useEntryStore } from './entryStore';
import { Entry } from './entryStore';

const createMockEntry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 1,
  armband: 10,
  callName: 'TestDog',
  breed: 'Golden Retriever',
  handler: 'Test Handler',
  jumpHeight: '16"',
  preferredTime: '2:30',
  isScored: false,
  inRing: false,
  resultText: undefined,
  searchTime: undefined,
  faultCount: undefined,
  placement: undefined,
  classId: 1,
  className: 'Novice A',
  section: 'A',
  element: 'Interior',
  level: 'Novice',
  checkedIn: false,
  checkinStatus: 'none',
  timeLimit: '3:00',
  timeLimit2: '3:00',
  timeLimit3: '3:00',
  areas: 1,
  ...overrides,
});

describe('entryStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useEntryStore.setState({
      entries: [],
      currentClassEntries: [],
      currentEntry: null,
      filters: {
        showScored: true,
        showUnscored: true,
        searchTerm: '',
        sortBy: 'armband',
        sortDirection: 'asc'
      },
      isLoading: false,
      error: null,
      currentPage: 1,
      entriesPerPage: 20,
      totalEntries: 0
    });
  });

  describe('setEntries', () => {
    it('should set entries and update total count', () => {
      const entries = [
        createMockEntry({ id: 1, armband: 10 }),
        createMockEntry({ id: 2, armband: 20 }),
      ];

      useEntryStore.getState().setEntries(entries);

      const state = useEntryStore.getState();
      expect(state.entries).toEqual(entries);
      expect(state.totalEntries).toBe(2);
      expect(state.currentPage).toBe(1);
      expect(state.error).toBeNull();
    });
  });

  describe('setCurrentClassEntries', () => {
    it('should filter entries by class ID', () => {
      const entries = [
        createMockEntry({ id: 1, classId: 1 }),
        createMockEntry({ id: 2, classId: 1 }),
        createMockEntry({ id: 3, classId: 2 }),
      ];

      useEntryStore.getState().setEntries(entries);
      useEntryStore.getState().setCurrentClassEntries(1);

      const state = useEntryStore.getState();
      expect(state.currentClassEntries).toHaveLength(2);
      expect(state.currentClassEntries[0].classId).toBe(1);
      expect(state.currentClassEntries[1].classId).toBe(1);
      expect(state.totalEntries).toBe(2);
    });
  });

  describe('updateEntry', () => {
    it('should update entry in all relevant arrays', () => {
      const entry = createMockEntry({ id: 1, classId: 1, isScored: false });
      
      useEntryStore.getState().setEntries([entry]);
      useEntryStore.getState().setCurrentClassEntries(1);
      useEntryStore.getState().setCurrentEntry(entry);

      useEntryStore.getState().updateEntry(1, { 
        isScored: true, 
        resultText: 'Q',
        searchTime: '1:23.45' 
      });

      const state = useEntryStore.getState();
      
      // Check all arrays are updated
      expect(state.entries[0].isScored).toBe(true);
      expect(state.entries[0].resultText).toBe('Q');
      expect(state.currentClassEntries[0].isScored).toBe(true);
      expect(state.currentEntry?.isScored).toBe(true);
    });

    it('should not update entries that do not match ID', () => {
      const entries = [
        createMockEntry({ id: 1, isScored: false }),
        createMockEntry({ id: 2, isScored: false }),
      ];

      useEntryStore.getState().setEntries(entries);
      useEntryStore.getState().updateEntry(1, { isScored: true });

      const state = useEntryStore.getState();
      expect(state.entries[0].isScored).toBe(true);
      expect(state.entries[1].isScored).toBe(false);
    });
  });

  describe('markAsScored', () => {
    it('should mark entry as scored with result and completed status', () => {
      const entry = createMockEntry({ id: 1, isScored: false, inRing: true, status: 'in-ring' });

      useEntryStore.getState().setEntries([entry]);
      useEntryStore.getState().markAsScored(1, 'Q');

      const state = useEntryStore.getState();
      expect(state.entries[0].isScored).toBe(true);
      expect(state.entries[0].resultText).toBe('Q');
      expect(state.entries[0].status).toBe('completed');
      expect(state.entries[0].inRing).toBe(false);
    });
  });

  describe('markInRing', () => {
    it('should update in-ring status', () => {
      const entry = createMockEntry({ id: 1, inRing: false });
      
      useEntryStore.getState().setEntries([entry]);
      useEntryStore.getState().markInRing(1, true);

      const state = useEntryStore.getState();
      expect(state.entries[0].inRing).toBe(true);
    });
  });

  describe('filters', () => {
    it('should update filters and reset page', () => {
      useEntryStore.getState().setFilter({ searchTerm: 'test', sortBy: 'callName' });

      const state = useEntryStore.getState();
      expect(state.filters.searchTerm).toBe('test');
      expect(state.filters.sortBy).toBe('callName');
      expect(state.currentPage).toBe(1);
    });

    it('should reset all filters', () => {
      // Set some filters first
      useEntryStore.getState().setFilter({ 
        searchTerm: 'test', 
        showScored: false,
        sortBy: 'handler'
      });

      useEntryStore.getState().resetFilters();

      const state = useEntryStore.getState();
      expect(state.filters.searchTerm).toBe('');
      expect(state.filters.showScored).toBe(true);
      expect(state.filters.sortBy).toBe('armband');
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      const entries = Array.from({ length: 50 }, (_, i) => 
        createMockEntry({ id: i + 1, armband: (i + 1) * 10 })
      );
      useEntryStore.getState().setEntries(entries);
    });

    it('should navigate to next page', () => {
      const store = useEntryStore.getState();
      store.nextPage();

      expect(useEntryStore.getState().currentPage).toBe(2);
    });

    it('should navigate to previous page', () => {
      const store = useEntryStore.getState();
      store.setPage(3);
      store.previousPage();

      expect(useEntryStore.getState().currentPage).toBe(2);
    });

    it('should not go below page 1', () => {
      const store = useEntryStore.getState();
      store.previousPage();

      expect(useEntryStore.getState().currentPage).toBe(1);
    });

    it('should not exceed max page', () => {
      const store = useEntryStore.getState();
      
      // With 50 entries and 20 per page, max should be 3
      store.setPage(5);
      expect(useEntryStore.getState().currentPage).toBe(3);
    });
  });

  describe('getFilteredEntries', () => {
    const entries = [
      createMockEntry({ 
        id: 1, 
        armband: 30, 
        callName: 'Alpha', 
        handler: 'Smith', 
        isScored: false 
      }),
      createMockEntry({ 
        id: 2, 
        armband: 10, 
        callName: 'Beta', 
        handler: 'Johnson', 
        isScored: true 
      }),
      createMockEntry({ 
        id: 3, 
        armband: 20, 
        callName: 'Charlie', 
        handler: 'Williams', 
        isScored: false 
      }),
    ];

    beforeEach(() => {
      useEntryStore.getState().setEntries(entries);
      useEntryStore.getState().setCurrentClassEntries(1);
    });

    it('should filter by scored status', () => {
      useEntryStore.getState().setFilter({ showScored: false });
      
      const filtered = useEntryStore.getState().getFilteredEntries();
      expect(filtered).toHaveLength(2);
      expect(filtered.every(e => !e.isScored)).toBe(true);
    });

    it('should filter by unscored status', () => {
      useEntryStore.getState().setFilter({ showUnscored: false });
      
      const filtered = useEntryStore.getState().getFilteredEntries();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].isScored).toBe(true);
    });

    it('should search by call name', () => {
      useEntryStore.getState().setFilter({ searchTerm: 'alpha' });
      
      const filtered = useEntryStore.getState().getFilteredEntries();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].callName).toBe('Alpha');
    });

    it('should search by handler', () => {
      useEntryStore.getState().setFilter({ searchTerm: 'smith' });
      
      const filtered = useEntryStore.getState().getFilteredEntries();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].handler).toBe('Smith');
    });

    it('should sort by armband ascending', () => {
      useEntryStore.getState().setFilter({ sortBy: 'armband', sortDirection: 'asc' });
      
      const filtered = useEntryStore.getState().getFilteredEntries();
      expect(filtered[0].armband).toBe(10);
      expect(filtered[1].armband).toBe(20);
      expect(filtered[2].armband).toBe(30);
    });

    it('should sort by call name descending', () => {
      useEntryStore.getState().setFilter({ sortBy: 'callName', sortDirection: 'desc' });
      
      const filtered = useEntryStore.getState().getFilteredEntries();
      expect(filtered[0].callName).toBe('Charlie');
      expect(filtered[1].callName).toBe('Beta');
      expect(filtered[2].callName).toBe('Alpha');
    });
  });

  describe('utility functions', () => {
    const entries = [
      createMockEntry({ id: 1, armband: 10, isScored: false }),
      createMockEntry({ id: 2, armband: 20, isScored: true }),
      createMockEntry({ id: 3, armband: 30, isScored: false }),
    ];

    beforeEach(() => {
      useEntryStore.getState().setEntries(entries);
      useEntryStore.getState().setCurrentClassEntries(1);
    });

    it('should get entry by armband', () => {
      const entry = useEntryStore.getState().getEntryByArmband(20);
      expect(entry?.id).toBe(2);
      expect(entry?.armband).toBe(20);
    });

    it('should return undefined for non-existent armband', () => {
      const entry = useEntryStore.getState().getEntryByArmband(999);
      expect(entry).toBeUndefined();
    });

    it('should get pending entries', () => {
      const pending = useEntryStore.getState().getPendingEntries();
      expect(pending).toHaveLength(2);
      expect(pending.every(e => !e.isScored)).toBe(true);
    });

    it('should get scored entries', () => {
      const scored = useEntryStore.getState().getScoredEntries();
      expect(scored).toHaveLength(1);
      expect(scored[0].isScored).toBe(true);
    });
  });
});