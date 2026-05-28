/**
 * Tests for Entry Store
 *
 * Comprehensive tests for Zustand entry store covering:
 * - Entry list state management
 * - Filtering and sorting entries
 * - In-ring status tracking
 * - Entry selection and updates
 * - Pagination logic
 * - Cache synchronization
 * - State updates and reactivity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEntryStore } from './entryStore';
import type { Entry, EntryStatus } from './entryStore';

// Helper to create mock entries
const createMockEntry = (overrides?: Partial<Entry>): Entry => ({
  id: '1',
  armband: 101,
  callName: 'Buddy',
  breed: 'Golden Retriever',
  handler: 'John Doe',
  jumpHeight: '20"',
  preferredTime: '09:00',
  isScored: false,
  status: 'no-status',
  classId: '1',
  className: 'Novice A',
  section: 'Container',
  element: 'Buried',
  level: 'Novice',
  timeLimit: '3:00',
  areas: 1,
  exhibitorOrder: 1,
  ...overrides,
});

describe('entryStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useEntryStore.setState({
      entries: [],
      currentClassEntries: [],
      currentEntry: null,
      filters: {
        showScored: true,
        showUnscored: true,
        searchTerm: '',
        sortBy: 'armband',
        sortDirection: 'asc',
      },
      isLoading: false,
      error: null,
      currentPage: 1,
      entriesPerPage: 20,
      totalEntries: 0,
    });
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useEntryStore.getState();

      expect(state.entries).toEqual([]);
      expect(state.currentClassEntries).toEqual([]);
      expect(state.currentEntry).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.currentPage).toBe(1);
      expect(state.entriesPerPage).toBe(20);
      expect(state.totalEntries).toBe(0);
    });

    it('should have default filters', () => {
      const state = useEntryStore.getState();

      expect(state.filters).toEqual({
        showScored: true,
        showUnscored: true,
        searchTerm: '',
        sortBy: 'armband',
        sortDirection: 'asc',
      });
    });
  });

  describe('setEntries', () => {
    it('should set entries and update totalEntries', () => {
      const entries = [
        createMockEntry({ id: '1', armband: 101 }),
        createMockEntry({ id: '2', armband: 102 }),
        createMockEntry({ id: '3', armband: 103 }),
      ];

      useEntryStore.getState().setEntries(entries);
      const state = useEntryStore.getState();

      expect(state.entries).toEqual(entries);
      expect(state.totalEntries).toBe(3);
    });

    it('should reset to page 1 when setting new entries', () => {
      useEntryStore.setState({ currentPage: 5 });

      const entries = [createMockEntry({ id: '1' })];
      useEntryStore.getState().setEntries(entries);

      expect(useEntryStore.getState().currentPage).toBe(1);
    });

    it('should clear error when setting entries', () => {
      useEntryStore.setState({ error: 'Previous error' });

      useEntryStore.getState().setEntries([createMockEntry()]);

      expect(useEntryStore.getState().error).toBeNull();
    });

    it('should handle empty array', () => {
      useEntryStore.getState().setEntries([]);
      const state = useEntryStore.getState();

      expect(state.entries).toEqual([]);
      expect(state.totalEntries).toBe(0);
    });

    it('should handle large entry lists', () => {
      const largeEntryList = Array.from({ length: 500 }, (_, i) =>
        createMockEntry({ id: String(i + 1), armband: 100 + i })
      );

      useEntryStore.getState().setEntries(largeEntryList);
      const state = useEntryStore.getState();

      expect(state.entries).toHaveLength(500);
      expect(state.totalEntries).toBe(500);
    });
  });

  describe('setCurrentClassEntries', () => {
    beforeEach(() => {
      const entries = [
        createMockEntry({ id: '1', classId: '1', armband: 101 }),
        createMockEntry({ id: '2', classId: '1', armband: 102 }),
        createMockEntry({ id: '3', classId: '2', armband: 103 }),
        createMockEntry({ id: '4', classId: '2', armband: 104 }),
        createMockEntry({ id: '5', classId: '1', armband: 105 }),
      ];
      useEntryStore.getState().setEntries(entries);
    });

    it('should filter entries by classId', () => {
      useEntryStore.getState().setCurrentClassEntries('1');
      const state = useEntryStore.getState();

      expect(state.currentClassEntries).toHaveLength(3);
      expect(state.currentClassEntries.every(e => e.classId === '1')).toBe(true);
    });

    it('should update totalEntries based on filtered entries', () => {
      useEntryStore.getState().setCurrentClassEntries('2');

      expect(useEntryStore.getState().totalEntries).toBe(2);
    });

    it('should reset to page 1 when filtering by class', () => {
      useEntryStore.setState({ currentPage: 3 });

      useEntryStore.getState().setCurrentClassEntries('1');

      expect(useEntryStore.getState().currentPage).toBe(1);
    });

    it('should handle class with no entries', () => {
      useEntryStore.getState().setCurrentClassEntries('999');
      const state = useEntryStore.getState();

      expect(state.currentClassEntries).toEqual([]);
      expect(state.totalEntries).toBe(0);
    });
  });

  describe('setCurrentEntry', () => {
    it('should set current entry', () => {
      const entry = createMockEntry({ id: '1' });

      useEntryStore.getState().setCurrentEntry(entry);

      expect(useEntryStore.getState().currentEntry).toEqual(entry);
    });

    it('should clear current entry with null', () => {
      const entry = createMockEntry({ id: '1' });
      useEntryStore.getState().setCurrentEntry(entry);

      useEntryStore.getState().setCurrentEntry(null);

      expect(useEntryStore.getState().currentEntry).toBeNull();
    });

    it('should replace existing current entry', () => {
      const entry1 = createMockEntry({ id: '1', callName: 'First' });
      const entry2 = createMockEntry({ id: '2', callName: 'Second' });

      useEntryStore.getState().setCurrentEntry(entry1);
      useEntryStore.getState().setCurrentEntry(entry2);

      expect(useEntryStore.getState().currentEntry).toEqual(entry2);
    });
  });

  describe('updateEntry', () => {
    beforeEach(() => {
      const entries = [
        createMockEntry({ id: '1', armband: 101, classId: '1' }),
        createMockEntry({ id: '2', armband: 102, classId: '1' }),
        createMockEntry({ id: '3', armband: 103, classId: '2' }),
      ];
      useEntryStore.getState().setEntries(entries);
      useEntryStore.getState().setCurrentClassEntries('1');
    });

    it('should update entry in entries array', () => {
      useEntryStore.getState().updateEntry('1', { callName: 'Updated Name' });

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry?.callName).toBe('Updated Name');
    });

    it('should update entry in currentClassEntries array', () => {
      useEntryStore.getState().updateEntry('1', { status: 'in-ring' });

      const entry = useEntryStore.getState().currentClassEntries.find(e => e.id === '1');
      expect(entry?.status).toBe('in-ring');
    });

    it('should update currentEntry if it matches', () => {
      const entry = createMockEntry({ id: '1' });
      useEntryStore.getState().setCurrentEntry(entry);

      useEntryStore.getState().updateEntry('1', { callName: 'Modified' });

      expect(useEntryStore.getState().currentEntry?.callName).toBe('Modified');
    });

    it('should not update currentEntry if id does not match', () => {
      const entry = createMockEntry({ id: '1', callName: 'Original' });
      useEntryStore.getState().setCurrentEntry(entry);

      useEntryStore.getState().updateEntry('2', { callName: 'Modified' });

      expect(useEntryStore.getState().currentEntry?.callName).toBe('Original');
    });

    it('should handle updating non-existent entry gracefully', () => {
      const beforeState = useEntryStore.getState();

      useEntryStore.getState().updateEntry('999', { callName: 'Ghost' });

      const afterState = useEntryStore.getState();
      expect(afterState.entries).toEqual(beforeState.entries);
    });

    it('should support partial updates', () => {
      useEntryStore.getState().updateEntry('1', {
        status: 'checked-in',
        isScored: false
      });

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry?.status).toBe('checked-in');
      expect(entry?.isScored).toBe(false);
      expect(entry?.armband).toBe(101); // Other fields unchanged
    });

    it('should update multiple fields at once', () => {
      useEntryStore.getState().updateEntry('1', {
        status: 'completed',
        isScored: true,
        resultText: 'Q',
        searchTime: '2:45',
        placement: 1,
      });

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry).toMatchObject({
        status: 'completed',
        isScored: true,
        resultText: 'Q',
        searchTime: '2:45',
        placement: 1,
      });
    });
  });

  describe('markAsScored', () => {
    beforeEach(() => {
      const entries = [
        createMockEntry({ id: '1', isScored: false, status: 'in-ring' }),
      ];
      useEntryStore.getState().setEntries(entries);
    });

    it('should mark entry as scored with result text', () => {
      useEntryStore.getState().markAsScored('1', 'Q - 1st');

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry?.isScored).toBe(true);
      expect(entry?.resultText).toBe('Q - 1st');
    });

    it('should set status to completed', () => {
      useEntryStore.getState().markAsScored('1', 'NQ');

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry?.status).toBe('completed');
    });

    it('should set deprecated inRing to false for backward compat', () => {
      useEntryStore.getState().markAsScored('1', 'Q');

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry?.inRing).toBe(false);
    });

    it('should handle qualifying result', () => {
      useEntryStore.getState().markAsScored('1', 'Q');

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry?.resultText).toBe('Q');
      expect(entry?.isScored).toBe(true);
    });

    it('should handle non-qualifying result', () => {
      useEntryStore.getState().markAsScored('1', 'NQ - No Find');

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry?.resultText).toBe('NQ - No Find');
      expect(entry?.isScored).toBe(true);
    });

    it('should handle absent result', () => {
      useEntryStore.getState().markAsScored('1', 'ABS');

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry?.resultText).toBe('ABS');
      expect(entry?.status).toBe('completed');
    });
  });

  describe('markInRing', () => {
    beforeEach(() => {
      const entries = [
        createMockEntry({ id: '1', inRing: false }),
      ];
      useEntryStore.getState().setEntries(entries);
    });

    it('should mark entry as in ring', () => {
      useEntryStore.getState().markInRing('1', true);

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry?.inRing).toBe(true);
    });

    it('should remove entry from ring', () => {
      useEntryStore.getState().updateEntry('1', { inRing: true });

      useEntryStore.getState().markInRing('1', false);

      const entry = useEntryStore.getState().entries.find(e => e.id === '1');
      expect(entry?.inRing).toBe(false);
    });

    it('should toggle in-ring status', () => {
      useEntryStore.getState().markInRing('1', true);
      expect(useEntryStore.getState().entries[0].inRing).toBe(true);

      useEntryStore.getState().markInRing('1', false);
      expect(useEntryStore.getState().entries[0].inRing).toBe(false);
    });
  });

  describe('Filter Management', () => {
    describe('setFilter', () => {
      it('should update single filter property', () => {
        useEntryStore.getState().setFilter({ showScored: false });

        expect(useEntryStore.getState().filters.showScored).toBe(false);
        expect(useEntryStore.getState().filters.showUnscored).toBe(true); // Unchanged
      });

      it('should update multiple filter properties', () => {
        useEntryStore.getState().setFilter({
          showScored: false,
          sortBy: 'callName',
        });

        const filters = useEntryStore.getState().filters;
        expect(filters.showScored).toBe(false);
        expect(filters.sortBy).toBe('callName');
      });

      it('should reset to page 1 when filters change', () => {
        useEntryStore.setState({ currentPage: 5 });

        useEntryStore.getState().setFilter({ searchTerm: 'test' });

        expect(useEntryStore.getState().currentPage).toBe(1);
      });

      it('should preserve other filter properties', () => {
        useEntryStore.getState().setFilter({ searchTerm: 'Buddy' });

        const filters = useEntryStore.getState().filters;
        expect(filters.searchTerm).toBe('Buddy');
        expect(filters.sortBy).toBe('armband'); // Default preserved
        expect(filters.sortDirection).toBe('asc'); // Default preserved
      });

      it('should update sort direction', () => {
        useEntryStore.getState().setFilter({ sortDirection: 'desc' });

        expect(useEntryStore.getState().filters.sortDirection).toBe('desc');
      });

      it('should update search term', () => {
        useEntryStore.getState().setFilter({ searchTerm: 'Golden' });

        expect(useEntryStore.getState().filters.searchTerm).toBe('Golden');
      });
    });

    describe('resetFilters', () => {
      it('should reset all filters to defaults', () => {
        useEntryStore.getState().setFilter({
          showScored: false,
          showUnscored: false,
          searchTerm: 'test',
          sortBy: 'handler',
          sortDirection: 'desc',
        });

        useEntryStore.getState().resetFilters();

        expect(useEntryStore.getState().filters).toEqual({
          showScored: true,
          showUnscored: true,
          searchTerm: '',
          sortBy: 'armband',
          sortDirection: 'asc',
        });
      });

      it('should reset to page 1', () => {
        useEntryStore.setState({ currentPage: 3 });

        useEntryStore.getState().resetFilters();

        expect(useEntryStore.getState().currentPage).toBe(1);
      });
    });
  });

  describe('Pagination', () => {
    beforeEach(() => {
      // Setup 50 entries for pagination tests
      const entries = Array.from({ length: 50 }, (_, i) =>
        createMockEntry({ id: String(i + 1), armband: 100 + i })
      );
      useEntryStore.getState().setEntries(entries);
      useEntryStore.setState({ entriesPerPage: 10 });
    });

    describe('setPage', () => {
      it('should set current page', () => {
        useEntryStore.getState().setPage(3);

        expect(useEntryStore.getState().currentPage).toBe(3);
      });

      it('should not exceed max page', () => {
        useEntryStore.getState().setPage(10); // Max should be 5 (50/10)

        expect(useEntryStore.getState().currentPage).toBe(5);
      });

      it('should not go below page 1', () => {
        useEntryStore.getState().setPage(-1);

        expect(useEntryStore.getState().currentPage).toBe(1);
      });

      it('should handle page 0 as page 1', () => {
        useEntryStore.getState().setPage(0);

        expect(useEntryStore.getState().currentPage).toBe(1);
      });

      it('should calculate max page correctly', () => {
        useEntryStore.setState({ totalEntries: 45, entriesPerPage: 10 });

        useEntryStore.getState().setPage(5);

        expect(useEntryStore.getState().currentPage).toBe(5);
      });

      it('should handle edge case with exact division', () => {
        useEntryStore.setState({ totalEntries: 40, entriesPerPage: 10 });

        useEntryStore.getState().setPage(4);

        expect(useEntryStore.getState().currentPage).toBe(4);
      });
    });

    describe('nextPage', () => {
      it('should increment page', () => {
        useEntryStore.getState().nextPage();

        expect(useEntryStore.getState().currentPage).toBe(2);
      });

      it('should not exceed max page', () => {
        useEntryStore.setState({ currentPage: 5 }); // Max page

        useEntryStore.getState().nextPage();

        expect(useEntryStore.getState().currentPage).toBe(5);
      });

      it('should handle multiple increments', () => {
        useEntryStore.getState().nextPage();
        useEntryStore.getState().nextPage();
        useEntryStore.getState().nextPage();

        expect(useEntryStore.getState().currentPage).toBe(4);
      });
    });

    describe('previousPage', () => {
      it('should decrement page', () => {
        useEntryStore.setState({ currentPage: 3 });

        useEntryStore.getState().previousPage();

        expect(useEntryStore.getState().currentPage).toBe(2);
      });

      it('should not go below page 1', () => {
        useEntryStore.setState({ currentPage: 1 });

        useEntryStore.getState().previousPage();

        expect(useEntryStore.getState().currentPage).toBe(1);
      });

      it('should handle multiple decrements', () => {
        useEntryStore.setState({ currentPage: 5 });

        useEntryStore.getState().previousPage();
        useEntryStore.getState().previousPage();
        useEntryStore.getState().previousPage();

        expect(useEntryStore.getState().currentPage).toBe(2);
      });
    });
  });

  describe('getFilteredEntries', () => {
    beforeEach(() => {
      const entries = [
        createMockEntry({ id: '1', armband: 101, callName: 'Buddy', handler: 'John Doe', breed: 'Golden Retriever', isScored: false, classId: '1' }),
        createMockEntry({ id: '2', armband: 102, callName: 'Max', handler: 'Jane Smith', breed: 'Labrador', isScored: true, classId: '1' }),
        createMockEntry({ id: '3', armband: 103, callName: 'Charlie', handler: 'Bob Johnson', breed: 'German Shepherd', isScored: false, classId: '1' }),
        createMockEntry({ id: '4', armband: 104, callName: 'Luna', handler: 'Alice Brown', breed: 'Border Collie', isScored: true, classId: '1' }),
        createMockEntry({ id: '5', armband: 105, callName: 'Rocky', handler: 'Charlie Davis', breed: 'Boxer', isScored: false, classId: '1' }),
      ];
      useEntryStore.getState().setEntries(entries);
      useEntryStore.getState().setCurrentClassEntries('1');
    });

    describe('Scored/Unscored Filtering', () => {
      it('should show all entries by default', () => {
        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toHaveLength(5);
      });

      it('should filter out scored entries when showScored is false', () => {
        useEntryStore.getState().setFilter({ showScored: false });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toHaveLength(3);
        expect(filtered.every(e => !e.isScored)).toBe(true);
      });

      it('should filter out unscored entries when showUnscored is false', () => {
        useEntryStore.getState().setFilter({ showUnscored: false });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toHaveLength(2);
        expect(filtered.every(e => e.isScored)).toBe(true);
      });

      it('should return empty array when both filters are false', () => {
        useEntryStore.getState().setFilter({ showScored: false, showUnscored: false });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toEqual([]);
      });
    });

    describe('Search Filtering', () => {
      it('should filter by call name', () => {
        useEntryStore.getState().setFilter({ searchTerm: 'Buddy' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toHaveLength(1);
        expect(filtered[0].callName).toBe('Buddy');
      });

      it('should filter by handler name', () => {
        useEntryStore.getState().setFilter({ searchTerm: 'Jane' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toHaveLength(1);
        expect(filtered[0].handler).toBe('Jane Smith');
      });

      it('should filter by breed', () => {
        useEntryStore.getState().setFilter({ searchTerm: 'Labrador' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toHaveLength(1);
        expect(filtered[0].breed).toBe('Labrador');
      });

      it('should filter by armband number', () => {
        useEntryStore.getState().setFilter({ searchTerm: '103' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toHaveLength(1);
        expect(filtered[0].armband).toBe(103);
      });

      it('should be case insensitive', () => {
        useEntryStore.getState().setFilter({ searchTerm: 'BUDDY' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toHaveLength(1);
        expect(filtered[0].callName).toBe('Buddy');
      });

      it('should filter by partial match', () => {
        useEntryStore.getState().setFilter({ searchTerm: 'Ch' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        // Should match Charlie (callName) and Charlie Davis (handler)
        expect(filtered.length).toBeGreaterThan(0);
      });

      it('should return empty array for no matches', () => {
        useEntryStore.getState().setFilter({ searchTerm: 'NoMatchXYZ' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toEqual([]);
      });

      it('should combine search with scored filter', () => {
        useEntryStore.getState().setFilter({
          searchTerm: 'a',
          showScored: false
        });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered.every(e => !e.isScored)).toBe(true);
      });
    });

    describe('Sorting', () => {
      it('should sort by armband ascending by default', () => {
        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered[0].armband).toBe(101);
        expect(filtered[4].armband).toBe(105);
      });

      it('should sort by armband descending', () => {
        useEntryStore.getState().setFilter({ sortDirection: 'desc' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered[0].armband).toBe(105);
        expect(filtered[4].armband).toBe(101);
      });

      it('should sort by call name ascending', () => {
        useEntryStore.getState().setFilter({ sortBy: 'callName' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered[0].callName).toBe('Buddy');
        expect(filtered[4].callName).toBe('Rocky');
      });

      it('should sort by call name descending', () => {
        useEntryStore.getState().setFilter({
          sortBy: 'callName',
          sortDirection: 'desc'
        });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered[0].callName).toBe('Rocky');
        expect(filtered[4].callName).toBe('Buddy');
      });

      it('should sort by handler ascending', () => {
        useEntryStore.getState().setFilter({ sortBy: 'handler' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered[0].handler).toBe('Alice Brown');
        expect(filtered[4].handler).toBe('John Doe');
      });

      it('should sort by handler descending', () => {
        useEntryStore.getState().setFilter({
          sortBy: 'handler',
          sortDirection: 'desc'
        });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered[0].handler).toBe('John Doe');
        expect(filtered[4].handler).toBe('Alice Brown');
      });

      it('should sort by status (scored vs unscored)', () => {
        useEntryStore.getState().setFilter({ sortBy: 'status' });

        const filtered = useEntryStore.getState().getFilteredEntries();

        // Unscored (0) should come before scored (1)
        expect(filtered[0].isScored).toBe(false);
        expect(filtered[4].isScored).toBe(true);
      });

      it('should sort by status descending', () => {
        useEntryStore.getState().setFilter({
          sortBy: 'status',
          sortDirection: 'desc'
        });

        const filtered = useEntryStore.getState().getFilteredEntries();

        // Scored (1) should come before unscored (0)
        expect(filtered[0].isScored).toBe(true);
      });
    });

    describe('Combined Filtering and Sorting', () => {
      it('should apply search filter then sort', () => {
        useEntryStore.getState().setFilter({
          searchTerm: 'o',
          sortBy: 'callName'
        });

        const filtered = useEntryStore.getState().getFilteredEntries();

        // Should find entries with 'o' and sort by name
        expect(filtered.length).toBeGreaterThan(0);
        const names = filtered.map(e => e.callName);
        const sortedNames = [...names].sort();
        expect(names).toEqual(sortedNames);
      });

      it('should apply scored filter, search, then sort', () => {
        useEntryStore.getState().setFilter({
          showScored: false,
          searchTerm: 'r',
          sortBy: 'armband',
          sortDirection: 'desc'
        });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered.every(e => !e.isScored)).toBe(true);
        // Check descending order
        if (filtered.length > 1) {
          expect(filtered[0].armband).toBeGreaterThan(filtered[filtered.length - 1].armband);
        }
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty currentClassEntries', () => {
        useEntryStore.setState({ currentClassEntries: [] });

        const filtered = useEntryStore.getState().getFilteredEntries();

        expect(filtered).toEqual([]);
      });

      it('should not mutate original entries array', () => {
        const originalLength = useEntryStore.getState().currentClassEntries.length;

        useEntryStore.getState().getFilteredEntries();

        expect(useEntryStore.getState().currentClassEntries.length).toBe(originalLength);
      });

      it('should return new array each time', () => {
        const filtered1 = useEntryStore.getState().getFilteredEntries();
        const filtered2 = useEntryStore.getState().getFilteredEntries();

        expect(filtered1).not.toBe(filtered2); // Different references
        expect(filtered1).toEqual(filtered2); // Same content
      });
    });
  });

  describe('getEntryByArmband', () => {
    beforeEach(() => {
      const entries = [
        createMockEntry({ id: '1', armband: 101 }),
        createMockEntry({ id: '2', armband: 102 }),
        createMockEntry({ id: '3', armband: 103 }),
      ];
      useEntryStore.getState().setEntries(entries);
    });

    it('should find entry by armband', () => {
      const entry = useEntryStore.getState().getEntryByArmband(102);

      expect(entry).toBeDefined();
      expect(entry?.armband).toBe(102);
      expect(entry?.id).toBe('2');
    });

    it('should return undefined for non-existent armband', () => {
      const entry = useEntryStore.getState().getEntryByArmband(999);

      expect(entry).toBeUndefined();
    });

    it('should find first entry if duplicate armbands exist', () => {
      // Add duplicate armband
      const entries = [
        ...useEntryStore.getState().entries,
        createMockEntry({ id: '4', armband: 101 }), // Duplicate
      ];
      useEntryStore.setState({ entries });

      const entry = useEntryStore.getState().getEntryByArmband(101);

      expect(entry?.id).toBe('1'); // First match
    });

    it('should search across all entries, not just current class', () => {
      useEntryStore.getState().setCurrentClassEntries('2'); // Empty class

      const entry = useEntryStore.getState().getEntryByArmband(101);

      expect(entry).toBeDefined();
      expect(entry?.armband).toBe(101);
    });
  });

  describe('getPendingEntries', () => {
    beforeEach(() => {
      const entries = [
        createMockEntry({ id: '1', armband: 101, isScored: false, classId: '1' }),
        createMockEntry({ id: '2', armband: 102, isScored: true, classId: '1' }),
        createMockEntry({ id: '3', armband: 103, isScored: false, classId: '1' }),
        createMockEntry({ id: '4', armband: 104, isScored: true, classId: '1' }),
        createMockEntry({ id: '5', armband: 105, isScored: false, classId: '1' }),
      ];
      useEntryStore.getState().setEntries(entries);
      useEntryStore.getState().setCurrentClassEntries('1');
    });

    it('should return unscored entries from current class', () => {
      const pending = useEntryStore.getState().getPendingEntries();

      expect(pending).toHaveLength(3);
      expect(pending.every(e => !e.isScored)).toBe(true);
    });

    it('should return empty array when all scored', () => {
      // Mark all as scored
      useEntryStore.setState({
        currentClassEntries: useEntryStore.getState().currentClassEntries.map(e => ({
          ...e,
          isScored: true,
        })),
      });

      const pending = useEntryStore.getState().getPendingEntries();

      expect(pending).toEqual([]);
    });

    it('should return all entries when none scored', () => {
      // Mark all as unscored
      useEntryStore.setState({
        currentClassEntries: useEntryStore.getState().currentClassEntries.map(e => ({
          ...e,
          isScored: false,
        })),
      });

      const pending = useEntryStore.getState().getPendingEntries();

      expect(pending).toHaveLength(5);
    });

    it('should only check currentClassEntries', () => {
      const pending = useEntryStore.getState().getPendingEntries();

      // All pending should be from class 1
      expect(pending.every(e => e.classId === '1')).toBe(true);
    });
  });

  describe('getScoredEntries', () => {
    beforeEach(() => {
      const entries = [
        createMockEntry({ id: '1', armband: 101, isScored: false, classId: '1' }),
        createMockEntry({ id: '2', armband: 102, isScored: true, classId: '1' }),
        createMockEntry({ id: '3', armband: 103, isScored: false, classId: '1' }),
        createMockEntry({ id: '4', armband: 104, isScored: true, classId: '1' }),
        createMockEntry({ id: '5', armband: 105, isScored: false, classId: '1' }),
      ];
      useEntryStore.getState().setEntries(entries);
      useEntryStore.getState().setCurrentClassEntries('1');
    });

    it('should return scored entries from current class', () => {
      const scored = useEntryStore.getState().getScoredEntries();

      expect(scored).toHaveLength(2);
      expect(scored.every(e => e.isScored)).toBe(true);
    });

    it('should return empty array when none scored', () => {
      // Mark all as unscored
      useEntryStore.setState({
        currentClassEntries: useEntryStore.getState().currentClassEntries.map(e => ({
          ...e,
          isScored: false,
        })),
      });

      const scored = useEntryStore.getState().getScoredEntries();

      expect(scored).toEqual([]);
    });

    it('should return all entries when all scored', () => {
      // Mark all as scored
      useEntryStore.setState({
        currentClassEntries: useEntryStore.getState().currentClassEntries.map(e => ({
          ...e,
          isScored: true,
        })),
      });

      const scored = useEntryStore.getState().getScoredEntries();

      expect(scored).toHaveLength(5);
    });

    it('should only check currentClassEntries', () => {
      const scored = useEntryStore.getState().getScoredEntries();

      // All scored should be from class 1
      expect(scored.every(e => e.classId === '1')).toBe(true);
    });

    it('should be complementary to getPendingEntries', () => {
      const pending = useEntryStore.getState().getPendingEntries();
      const scored = useEntryStore.getState().getScoredEntries();
      const total = useEntryStore.getState().currentClassEntries.length;

      expect(pending.length + scored.length).toBe(total);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete scoring workflow', () => {
      // Setup initial entries
      const entries = [
        createMockEntry({ id: '1', armband: 101, status: 'no-status', isScored: false }),
        createMockEntry({ id: '2', armband: 102, status: 'no-status', isScored: false }),
      ];
      useEntryStore.getState().setEntries(entries);

      // Mark entry as in ring
      useEntryStore.getState().updateEntry('1', { status: 'in-ring' });
      expect(useEntryStore.getState().entries[0].status).toBe('in-ring');

      // Mark as scored
      useEntryStore.getState().markAsScored('1', 'Q - 1st');
      const scoredEntry = useEntryStore.getState().entries[0];
      expect(scoredEntry.isScored).toBe(true);
      expect(scoredEntry.status).toBe('completed');
      expect(scoredEntry.resultText).toBe('Q - 1st');
    });

    it('should handle filtering during live scoring', () => {
      const entries = Array.from({ length: 20 }, (_, i) =>
        createMockEntry({
          id: String(i + 1),
          armband: 100 + i,
          isScored: i % 3 === 0, // Every 3rd is scored
          classId: '1',
        })
      );
      useEntryStore.getState().setEntries(entries);
      useEntryStore.getState().setCurrentClassEntries('1');

      // Filter to show only pending
      useEntryStore.getState().setFilter({ showScored: false });
      const pending = useEntryStore.getState().getFilteredEntries();
      expect(pending.every(e => !e.isScored)).toBe(true);

      // Score an entry
      useEntryStore.getState().markAsScored('2', 'Q');

      // Pending should decrease
      const newPending = useEntryStore.getState().getFilteredEntries();
      expect(newPending.length).toBe(pending.length - 1);
    });

    it('should maintain pagination across updates', () => {
      const entries = Array.from({ length: 50 }, (_, i) =>
        createMockEntry({ id: String(i + 1), armband: 100 + i })
      );
      useEntryStore.getState().setEntries(entries);
      useEntryStore.setState({ entriesPerPage: 10 });

      // Navigate to page 3
      useEntryStore.getState().setPage(3);
      expect(useEntryStore.getState().currentPage).toBe(3);

      // Update entry doesn't reset page
      useEntryStore.getState().updateEntry('25', { callName: 'Updated' });
      expect(useEntryStore.getState().currentPage).toBe(3);

      // But filter does reset page
      useEntryStore.getState().setFilter({ searchTerm: 'test' });
      expect(useEntryStore.getState().currentPage).toBe(1);
    });

    it('should sync currentEntry with updates', () => {
      const entry = createMockEntry({ id: '1', armband: 101 });
      useEntryStore.getState().setEntries([entry]);
      useEntryStore.getState().setCurrentEntry(entry);

      // Update entry
      useEntryStore.getState().updateEntry('1', {
        callName: 'Updated Name',
        status: 'checked-in'
      });

      // Current entry should reflect update
      const currentEntry = useEntryStore.getState().currentEntry;
      expect(currentEntry?.callName).toBe('Updated Name');
      expect(currentEntry?.status).toBe('checked-in');
    });

    it('should handle rapid status changes', () => {
      const entry = createMockEntry({ id: '1', status: 'no-status' });
      useEntryStore.getState().setEntries([entry]);

      // Rapid status changes
      useEntryStore.getState().updateEntry('1', { status: 'checked-in' });
      useEntryStore.getState().updateEntry('1', { status: 'at-gate' });
      useEntryStore.getState().updateEntry('1', { status: 'in-ring' });
      useEntryStore.getState().markAsScored('1', 'Q');

      const finalEntry = useEntryStore.getState().entries[0];
      expect(finalEntry.status).toBe('completed');
      expect(finalEntry.isScored).toBe(true);
    });
  });

  describe('EntryStatus Type Safety', () => {
    it('should accept all valid status values', () => {
      const validStatuses: EntryStatus[] = [
        'no-status',
        'checked-in',
        'at-gate',
        'come-to-gate',
        'conflict',
        'pulled',
        'in-ring',
        'completed',
      ];

      validStatuses.forEach(status => {
        const entry = createMockEntry({ status });
        expect(entry.status).toBe(status);
      });
    });

    it('should handle status transitions correctly', () => {
      const entry = createMockEntry({ id: '1', status: 'no-status' });
      useEntryStore.getState().setEntries([entry]);

      // Typical workflow progression
      const statusProgression: EntryStatus[] = [
        'checked-in',
        'at-gate',
        'in-ring',
        'completed',
      ];

      statusProgression.forEach(status => {
        useEntryStore.getState().updateEntry('1', { status });
        expect(useEntryStore.getState().entries[0].status).toBe(status);
      });
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large entry lists efficiently', () => {
      const largeList = Array.from({ length: 1000 }, (_, i) =>
        createMockEntry({ id: String(i + 1), armband: 1000 + i })
      );

      const startTime = performance.now();
      useEntryStore.getState().setEntries(largeList);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100); // Should be fast
      expect(useEntryStore.getState().entries).toHaveLength(1000);
    });

    it('should handle filtering on large lists', () => {
      const largeList = Array.from({ length: 1000 }, (_, i) =>
        createMockEntry({
          id: String(i + 1),
          armband: 1000 + i,
          callName: i % 10 === 0 ? 'Buddy' : `Dog${i}`,
          isScored: i % 2 === 0,
          classId: '1',
        })
      );
      useEntryStore.getState().setEntries(largeList);
      useEntryStore.getState().setCurrentClassEntries('1');

      const startTime = performance.now();
      useEntryStore.getState().setFilter({ searchTerm: 'Buddy', showScored: false });
      const filtered = useEntryStore.getState().getFilteredEntries();
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(50); // Should be fast
      expect(filtered.every(e => e.callName.includes('Buddy'))).toBe(true);
    });

    it('should handle concurrent updates gracefully', () => {
      const entries = [
        createMockEntry({ id: '1', armband: 101 }),
        createMockEntry({ id: '2', armband: 102 }),
      ];
      useEntryStore.getState().setEntries(entries);

      // Simulate concurrent updates
      useEntryStore.getState().updateEntry('1', { callName: 'Update1' });
      useEntryStore.getState().updateEntry('2', { callName: 'Update2' });
      useEntryStore.getState().updateEntry('1', { status: 'checked-in' });

      const state = useEntryStore.getState();
      expect(state.entries[0].callName).toBe('Update1');
      expect(state.entries[0].status).toBe('checked-in');
      expect(state.entries[1].callName).toBe('Update2');
    });

    it('should handle undefined optional fields', () => {
      const minimalEntry = createMockEntry({
        jumpHeight: undefined,
        preferredTime: undefined,
        resultText: undefined,
      });

      useEntryStore.getState().setEntries([minimalEntry]);

      const entry = useEntryStore.getState().entries[0];
      expect(entry.jumpHeight).toBeUndefined();
      expect(entry.preferredTime).toBeUndefined();
      expect(entry.resultText).toBeUndefined();
    });
  });

  describe('State Isolation', () => {
    it('should not affect other state when updating entries', () => {
      useEntryStore.setState({
        isLoading: true,
        error: 'Some error',
        currentPage: 5,
      });

      useEntryStore.getState().setEntries([createMockEntry()]);

      // Should clear error but preserve loading
      expect(useEntryStore.getState().isLoading).toBe(true);
      expect(useEntryStore.getState().error).toBeNull();
    });

    it('should maintain filter state across entry updates', () => {
      useEntryStore.getState().setFilter({
        sortBy: 'handler',
        sortDirection: 'desc',
        searchTerm: 'test',
      });

      const filters = useEntryStore.getState().filters;

      useEntryStore.getState().updateEntry('1', { callName: 'Updated' });

      // Filters should be unchanged
      expect(useEntryStore.getState().filters).toEqual(filters);
    });
  });
});
