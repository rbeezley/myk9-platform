import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntryListFilters } from './useEntryListFilters';
import type { BaseEntry } from '../types';

// Test entry factory
function createEntry(overrides: Partial<BaseEntry> & { id: number }): BaseEntry {
  return {
    armband: overrides.id * 100,
    callName: `Dog${overrides.id}`,
    handler: `Handler${overrides.id}`,
    breed: 'Labrador',
    isScored: false,
    exhibitorOrder: overrides.id,
    ...overrides,
  };
}

const sampleEntries: BaseEntry[] = [
  createEntry({ id: 1, armband: 301, callName: 'Zeus', handler: 'Alice', breed: 'Golden Retriever' }),
  createEntry({ id: 2, armband: 102, callName: 'Apollo', handler: 'Bob', breed: 'Beagle' }),
  createEntry({ id: 3, armband: 203, callName: 'Luna', handler: 'Carol', breed: 'Poodle', isScored: true }),
  createEntry({ id: 4, armband: 404, callName: 'Max', handler: 'Dave', breed: 'German Shepherd', status: 'in-ring', inRing: true }),
  createEntry({ id: 5, armband: 505, callName: 'Bella', handler: 'Eve', breed: 'Labrador', status: 'pulled' }),
];

describe('useEntryListFilters', () => {
  describe('initial state', () => {
    it('should default to pending tab and armband sort', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      expect(result.current.activeTab).toBe('pending');
      expect(result.current.sortBy).toBe('armband');
      expect(result.current.searchTerm).toBe('');
    });

    it('should accept a custom default sort', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries, defaultSort: 'name' })
      );
      expect(result.current.sortBy).toBe('name');
    });
  });

  describe('tab filtering', () => {
    it('should show only pending entries on pending tab', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      // Entry id 3 is scored, so pending tab should have 4 entries
      expect(result.current.filteredEntries.every(e => !e.isScored)).toBe(true);
      expect(result.current.filteredEntries.length).toBe(4);
    });

    it('should show only completed entries on completed tab', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setActiveTab('completed');
      });

      expect(result.current.filteredEntries.every(e => e.isScored)).toBe(true);
      expect(result.current.filteredEntries.length).toBe(1);
    });
  });

  describe('entry counts', () => {
    it('should count pending and completed entries', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      expect(result.current.entryCounts.pending).toBe(4);
      expect(result.current.entryCounts.completed).toBe(1);
    });
  });

  describe('search filtering', () => {
    it('should filter by callName', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setSearchTerm('zeus');
      });

      expect(result.current.filteredEntries.length).toBe(1);
      expect(result.current.filteredEntries[0].callName).toBe('Zeus');
    });

    it('should filter by armband number', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setSearchTerm('301');
      });

      expect(result.current.filteredEntries.length).toBe(1);
      expect(result.current.filteredEntries[0].armband).toBe(301);
    });

    it('should filter by handler name', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setSearchTerm('bob');
      });

      expect(result.current.filteredEntries.length).toBe(1);
      expect(result.current.filteredEntries[0].handler).toBe('Bob');
    });

    it('should filter by breed', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setSearchTerm('beagle');
      });

      expect(result.current.filteredEntries.length).toBe(1);
    });

    it('should return empty when search does not match', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setSearchTerm('zzzzz');
      });

      expect(result.current.filteredEntries.length).toBe(0);
    });
  });

  describe('sorting', () => {
    it('should sort by armband number', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      const armbands = result.current.filteredEntries.map(e => e.armband!);
      for (let i = 1; i < armbands.length; i++) {
        expect(armbands[i]).toBeGreaterThanOrEqual(armbands[i - 1]);
      }
    });

    it('should sort by name', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setSortBy('name');
      });

      const names = result.current.filteredEntries.map(e => e.callName!);
      for (let i = 1; i < names.length; i++) {
        expect(names[i].localeCompare(names[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('should sort by handler', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setSortBy('handler');
      });

      const handlers = result.current.filteredEntries.map(e => e.handler!);
      for (let i = 1; i < handlers.length; i++) {
        expect(handlers[i].localeCompare(handlers[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('should sort by breed', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setSortBy('breed');
      });

      const breeds = result.current.filteredEntries.map(e => e.breed!);
      for (let i = 1; i < breeds.length; i++) {
        expect(breeds[i].localeCompare(breeds[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('should sort by run order (exhibitorOrder)', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setSortBy('run');
      });

      const orders = result.current.filteredEntries.map(e => e.exhibitorOrder!);
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i]).toBeGreaterThanOrEqual(orders[i - 1]);
      }
    });
  });

  describe('priority sorting', () => {
    it('should put in-ring dogs first when prioritizeInRing is true', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({
          entries: sampleEntries,
          prioritizeInRing: true,
        })
      );

      const first = result.current.filteredEntries[0];
      expect(first.inRing || first.status === 'in-ring').toBe(true);
    });

    it('should put pulled dogs last when deprioritizePulled is true', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({
          entries: sampleEntries,
          deprioritizePulled: true,
        })
      );

      const last = result.current.filteredEntries[result.current.filteredEntries.length - 1];
      expect(last.status).toBe('pulled');
    });
  });

  describe('section filtering', () => {
    const sectionEntries: BaseEntry[] = [
      createEntry({ id: 1, section: 'A' }),
      createEntry({ id: 2, section: 'A' }),
      createEntry({ id: 3, section: 'B' }),
    ];

    it('should show all entries when section is "all"', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({
          entries: sectionEntries,
          supportSectionFilter: true,
        })
      );

      expect(result.current.filteredEntries.length).toBe(3);
    });

    it('should filter by section A', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({
          entries: sectionEntries,
          supportSectionFilter: true,
        })
      );

      act(() => {
        result.current.setSectionFilter('A');
      });

      expect(result.current.filteredEntries.length).toBe(2);
      expect(result.current.filteredEntries.every(e => e.section === 'A')).toBe(true);
    });

    it('should compute section counts', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({
          entries: sectionEntries,
          supportSectionFilter: true,
        })
      );

      expect(result.current.sectionCounts).not.toBeNull();
      expect(result.current.sectionCounts!.all).toBe(3);
      expect(result.current.sectionCounts!.A).toBe(2);
      expect(result.current.sectionCounts!.B).toBe(1);
    });

    it('should return null sectionCounts when supportSectionFilter is false', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sectionEntries })
      );

      expect(result.current.sectionCounts).toBeNull();
    });
  });

  describe('pendingEntries / completedEntries', () => {
    it('should split filtered entries into pending and completed', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      // On pending tab, pending = filtered, completed = empty
      expect(result.current.pendingEntries.length).toBe(result.current.filteredEntries.length);
      expect(result.current.completedEntries.length).toBe(0);
    });
  });

  describe('resetFilters', () => {
    it('should reset all filters to defaults', () => {
      const { result } = renderHook(() =>
        useEntryListFilters({ entries: sampleEntries })
      );

      act(() => {
        result.current.setSearchTerm('test');
        result.current.setSortBy('name');
        result.current.setSectionFilter('A');
      });

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.searchTerm).toBe('');
      expect(result.current.sortBy).toBe('armband');
      expect(result.current.sectionFilter).toBe('all');
    });
  });
});
