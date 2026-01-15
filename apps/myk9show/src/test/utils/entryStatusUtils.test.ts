/**
 * Unit tests for entryStatusUtils
 * Tests entry status calculation, badge styling, and user entries detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getEntryStatus,
  getEntryStatusBadgeStyle,
  userHasEntriesForShow,
  type EntryStatus,
} from '@/utils/entryStatusUtils';
import type { Show } from '@/types/show-types';

// Helper to create a mock show with specified dates
function createMockShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-123',
    name: 'Test Show',
    entryOpenDate: '2024-01-01',
    entryCloseDate: '2024-02-01',
    startDate: '2024-02-15',
    endDate: '2024-02-16',
    ...overrides,
  } as Show;
}

describe('entryStatusUtils', () => {
  describe('getEntryStatus', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('when user has submitted entries', () => {
      it('should return submitted status regardless of dates', () => {
        const now = new Date('2024-01-15'); // During open period
        vi.setSystemTime(now);

        const show = createMockShow();
        const result = getEntryStatus(show, true);

        expect(result.status).toBe('submitted');
        expect(result.label).toBe('Entry Submitted');
        expect(result.description).toBe('You have entries for this show');
        expect(result.canEnter).toBe(true);
      });

      it('should return submitted even when entries are closed', () => {
        const now = new Date('2024-03-01'); // After close date
        vi.setSystemTime(now);

        const show = createMockShow();
        const result = getEntryStatus(show, true);

        expect(result.status).toBe('submitted');
        expect(result.canEnter).toBe(true); // Can still add more entries
      });
    });

    describe('when entries are not yet open', () => {
      it('should return not_yet_open status', () => {
        const now = new Date('2023-12-15'); // Before open date
        vi.setSystemTime(now);

        const show = createMockShow({
          entryOpenDate: '2024-01-01',
        });
        const result = getEntryStatus(show, false);

        expect(result.status).toBe('not_yet_open');
        expect(result.canEnter).toBe(false);
        expect(result.daysUntilOpen).toBeGreaterThan(0);
      });

      it('should calculate days until open correctly', () => {
        const now = new Date('2023-12-25'); // 7 days before open
        vi.setSystemTime(now);

        const show = createMockShow({
          entryOpenDate: '2024-01-01',
        });
        const result = getEntryStatus(show, false);

        expect(result.daysUntilOpen).toBe(7);
        expect(result.description).toContain('7 days');
      });

      it('should use singular "day" for 1 day until open', () => {
        const now = new Date('2023-12-31'); // 1 day before open
        vi.setSystemTime(now);

        const show = createMockShow({
          entryOpenDate: '2024-01-01',
        });
        const result = getEntryStatus(show, false);

        expect(result.daysUntilOpen).toBe(1);
        expect(result.description).toContain('1 day');
        expect(result.description).not.toContain('1 days');
      });
    });

    describe('when entries are closed', () => {
      it('should return closed status after close date', () => {
        const now = new Date('2024-02-15'); // After close date
        vi.setSystemTime(now);

        const show = createMockShow({
          entryCloseDate: '2024-02-01',
        });
        const result = getEntryStatus(show, false);

        expect(result.status).toBe('closed');
        expect(result.label).toBe('Entries Closed');
        expect(result.canEnter).toBe(false);
      });
    });

    describe('when entries are closing soon (within 7 days)', () => {
      it('should return closing_soon when 7 days remain', () => {
        const now = new Date('2024-01-25'); // 7 days before close
        vi.setSystemTime(now);

        const show = createMockShow({
          entryOpenDate: '2024-01-01',
          entryCloseDate: '2024-02-01',
        });
        const result = getEntryStatus(show, false);

        expect(result.status).toBe('closing_soon');
        expect(result.canEnter).toBe(true);
        expect(result.daysUntilClose).toBe(7);
      });

      it('should return closing_soon when 1 day remains', () => {
        const now = new Date('2024-01-31'); // 1 day before close
        vi.setSystemTime(now);

        const show = createMockShow({
          entryOpenDate: '2024-01-01',
          entryCloseDate: '2024-02-01',
        });
        const result = getEntryStatus(show, false);

        expect(result.status).toBe('closing_soon');
        expect(result.daysUntilClose).toBe(1);
        expect(result.label).toContain('1 day');
        expect(result.label).not.toContain('1 days');
      });

      it('should show "Closes Today!" when closing today', () => {
        const now = new Date('2024-02-01'); // Same day as close
        vi.setSystemTime(now);

        const show = createMockShow({
          entryOpenDate: '2024-01-01',
          entryCloseDate: '2024-02-01',
        });
        const result = getEntryStatus(show, false);

        expect(result.status).toBe('closing_soon');
        expect(result.daysUntilClose).toBe(0);
        expect(result.label).toBe('Closes Today!');
      });

      it('should include "Hurry!" in description when closing soon', () => {
        const now = new Date('2024-01-28'); // 4 days before close
        vi.setSystemTime(now);

        const show = createMockShow({
          entryOpenDate: '2024-01-01',
          entryCloseDate: '2024-02-01',
        });
        const result = getEntryStatus(show, false);

        expect(result.description).toContain('Hurry!');
      });
    });

    describe('when actively accepting entries (more than 7 days)', () => {
      it('should return accepting status', () => {
        const now = new Date('2024-01-10'); // 22 days before close
        vi.setSystemTime(now);

        const show = createMockShow({
          entryOpenDate: '2024-01-01',
          entryCloseDate: '2024-02-01',
        });
        const result = getEntryStatus(show, false);

        expect(result.status).toBe('accepting');
        expect(result.label).toBe('Accepting Entries');
        expect(result.canEnter).toBe(true);
        expect(result.daysUntilClose).toBe(22);
      });

      it('should return accepting when exactly 8 days remain', () => {
        const now = new Date('2024-01-24'); // 8 days before close
        vi.setSystemTime(now);

        const show = createMockShow({
          entryOpenDate: '2024-01-01',
          entryCloseDate: '2024-02-01',
        });
        const result = getEntryStatus(show, false);

        expect(result.status).toBe('accepting');
        expect(result.daysUntilClose).toBe(8);
      });
    });
  });

  describe('getEntryStatusBadgeStyle', () => {
    it('should return success styling for accepting status', () => {
      const result = getEntryStatusBadgeStyle('accepting');

      expect(result.className).toContain('success-green');
      expect(result.variant).toBe('default');
    });

    it('should return warning styling with animation for closing_soon', () => {
      const result = getEntryStatusBadgeStyle('closing_soon');

      expect(result.className).toContain('warning-orange');
      expect(result.className).toContain('animate-pulse');
      expect(result.variant).toBe('default');
    });

    it('should return muted styling for closed status', () => {
      const result = getEntryStatusBadgeStyle('closed');

      expect(result.className).toContain('muted');
      expect(result.variant).toBe('secondary');
    });

    it('should return primary styling for submitted status', () => {
      const result = getEntryStatusBadgeStyle('submitted');

      expect(result.className).toContain('primary');
      expect(result.variant).toBe('default');
    });

    it('should return outline styling for not_yet_open status', () => {
      const result = getEntryStatusBadgeStyle('not_yet_open');

      expect(result.className).toContain('muted');
      expect(result.variant).toBe('outline');
    });

    it('should return default styling for unknown status', () => {
      const result = getEntryStatusBadgeStyle('unknown' as EntryStatus);

      expect(result.variant).toBe('secondary');
    });
  });

  describe('userHasEntriesForShow', () => {
    it('should return true when user has entry with matching showId', () => {
      const showId = 'show-123';
      const userEntries = [
        { showId: 'show-456' },
        { showId: 'show-123' },
        { showId: 'show-789' },
      ];

      const result = userHasEntriesForShow(showId, userEntries);

      expect(result).toBe(true);
    });

    it('should return true when user has entry with matching show_id (snake_case)', () => {
      const showId = 'show-123';
      const userEntries = [
        { show_id: 'show-456' },
        { show_id: 'show-123' },
      ];

      const result = userHasEntriesForShow(showId, userEntries);

      expect(result).toBe(true);
    });

    it('should return false when no entries match', () => {
      const showId = 'show-123';
      const userEntries = [
        { showId: 'show-456' },
        { showId: 'show-789' },
      ];

      const result = userHasEntriesForShow(showId, userEntries);

      expect(result).toBe(false);
    });

    it('should return false for empty entries array', () => {
      const result = userHasEntriesForShow('show-123', []);

      expect(result).toBe(false);
    });

    it('should return false for undefined entries', () => {
      const result = userHasEntriesForShow('show-123');

      expect(result).toBe(false);
    });

    it('should handle mixed showId and show_id formats', () => {
      const showId = 'show-123';
      const userEntries = [
        { showId: 'show-456' },
        { show_id: 'show-123' }, // Match via snake_case
        { showId: 'show-789' },
      ];

      const result = userHasEntriesForShow(showId, userEntries);

      expect(result).toBe(true);
    });
  });
});
