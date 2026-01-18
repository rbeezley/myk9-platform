import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStaleDataStatus, formatStaleTime } from '@/utils/staleDataUtils';
import { CLASS_STATUS } from '@myk9/core';

describe('staleDataUtils', () => {
  describe('getStaleDataStatus', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return not stale for non-in-progress class', () => {
      const result = getStaleDataStatus(CLASS_STATUS.SCHEDULED, new Date().toISOString());

      expect(result.isStale).toBe(false);
      expect(result.shouldShowWarning).toBe(false);
      expect(result.minutesSinceLastResult).toBe(null);
    });

    it('should return not stale for completed class', () => {
      const result = getStaleDataStatus(CLASS_STATUS.COMPLETED, new Date().toISOString());

      expect(result.isStale).toBe(false);
      expect(result.shouldShowWarning).toBe(false);
    });

    it('should return not stale for in-progress class with no results', () => {
      const result = getStaleDataStatus(CLASS_STATUS.IN_PROGRESS, null);

      expect(result.isStale).toBe(false);
      expect(result.shouldShowWarning).toBe(false);
      expect(result.minutesSinceLastResult).toBe(null);
    });

    it('should return not stale for in-progress class with recent results', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      // Result from 5 minutes ago
      const lastResult = new Date('2024-01-15T09:55:00Z');
      const result = getStaleDataStatus(CLASS_STATUS.IN_PROGRESS, lastResult.toISOString());

      expect(result.isStale).toBe(false);
      expect(result.shouldShowWarning).toBe(false);
      expect(result.minutesSinceLastResult).toBe(5);
    });

    it('should return stale for in-progress class with old results (10+ minutes)', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      // Result from 15 minutes ago
      const lastResult = new Date('2024-01-15T09:45:00Z');
      const result = getStaleDataStatus(CLASS_STATUS.IN_PROGRESS, lastResult.toISOString());

      expect(result.isStale).toBe(true);
      expect(result.shouldShowWarning).toBe(true);
      expect(result.minutesSinceLastResult).toBe(15);
    });

    it('should handle exactly 10 minute threshold', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      // Result from exactly 10 minutes ago
      const lastResult = new Date('2024-01-15T09:50:00Z');
      const result = getStaleDataStatus(CLASS_STATUS.IN_PROGRESS, lastResult.toISOString());

      expect(result.isStale).toBe(true);
      expect(result.shouldShowWarning).toBe(true);
      expect(result.minutesSinceLastResult).toBe(10);
    });

    it('should handle 9 minutes (not yet stale)', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      // Result from 9 minutes ago
      const lastResult = new Date('2024-01-15T09:51:00Z');
      const result = getStaleDataStatus(CLASS_STATUS.IN_PROGRESS, lastResult.toISOString());

      expect(result.isStale).toBe(false);
      expect(result.shouldShowWarning).toBe(false);
      expect(result.minutesSinceLastResult).toBe(9);
    });

    it('should accept Date object for lastResultAt', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const lastResult = new Date('2024-01-15T09:45:00Z');
      const result = getStaleDataStatus(CLASS_STATUS.IN_PROGRESS, lastResult);

      expect(result.isStale).toBe(true);
      expect(result.minutesSinceLastResult).toBe(15);
    });

    it('should handle undefined lastResultAt', () => {
      const result = getStaleDataStatus(CLASS_STATUS.IN_PROGRESS, undefined);

      expect(result.isStale).toBe(false);
      expect(result.shouldShowWarning).toBe(false);
      expect(result.minutesSinceLastResult).toBe(null);
    });
  });

  describe('formatStaleTime', () => {
    it('should format minutes under 60', () => {
      expect(formatStaleTime(5)).toBe('5 min ago');
      expect(formatStaleTime(15)).toBe('15 min ago');
      expect(formatStaleTime(59)).toBe('59 min ago');
    });

    it('should format exactly 60 minutes as 1 hour', () => {
      expect(formatStaleTime(60)).toBe('1 hr ago');
    });

    it('should format hours', () => {
      expect(formatStaleTime(90)).toBe('1 hr ago');
      expect(formatStaleTime(120)).toBe('2 hr ago');
      expect(formatStaleTime(180)).toBe('3 hr ago');
    });

    it('should floor hours', () => {
      expect(formatStaleTime(119)).toBe('1 hr ago'); // 1.98 hours -> 1 hr
      expect(formatStaleTime(150)).toBe('2 hr ago'); // 2.5 hours -> 2 hr
    });
  });
});
