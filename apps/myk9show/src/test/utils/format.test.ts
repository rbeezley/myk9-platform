import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatBytes,
  formatDuration,
  formatPercentage,
  formatNumber,
  formatRelativeTime,
  formatCurrency,
  formatFileSize,
  formatCompressionRatio,
  formatNetworkSpeed,
} from '@/utils/format';

describe('format utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatBytes', () => {
    it('should format zero bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes', () => {
      expect(formatBytes(1)).toBe('1 Bytes');
      expect(formatBytes(512)).toBe('512 Bytes');
      expect(formatBytes(1023)).toBe('1023 Bytes');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(2048)).toBe('2 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB');
      expect(formatBytes(1024 * 1024 * 2)).toBe('2 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
    });

    it('should format larger units', () => {
      expect(formatBytes(1024 ** 4)).toBe('1 TB');
      expect(formatBytes(1024 ** 5)).toBe('1 PB');
      expect(formatBytes(1024 ** 6)).toBe('1 EB');
    });

    it('should respect decimal places', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB');
      expect(formatBytes(1536, 1)).toBe('1.5 KB');
      expect(formatBytes(1536, 3)).toBe('1.5 KB'); // formatBytes strips trailing zeros
    });

    it('should handle negative decimal places', () => {
      expect(formatBytes(1536, -1)).toBe('2 KB');
    });

    it('should handle large numbers correctly', () => {
      expect(formatBytes(1024 ** 8)).toBe('1 YB');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(59000)).toBe('59s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(120000)).toBe('2m');
      expect(formatDuration(3599000)).toBe('59m 59s');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(5400000)).toBe('1h 30m');
      expect(formatDuration(7200000)).toBe('2h');
    });

    it('should handle edge cases', () => {
      expect(formatDuration(1)).toBe('1ms');
      expect(formatDuration(59999)).toBe('59s');
      expect(formatDuration(3599999)).toBe('59m 59s');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentages with default decimal places', () => {
      expect(formatPercentage(0)).toBe('0.0%');
      expect(formatPercentage(50)).toBe('50.0%');
      expect(formatPercentage(100)).toBe('100.0%');
    });

    it('should format percentages with custom decimal places', () => {
      expect(formatPercentage(50, 0)).toBe('50%');
      expect(formatPercentage(50.123, 2)).toBe('50.12%');
      expect(formatPercentage(50.987, 3)).toBe('50.987%');
    });

    it('should handle decimal values', () => {
      expect(formatPercentage(0.5, 1)).toBe('0.5%');
      expect(formatPercentage(99.99, 2)).toBe('99.99%');
    });

    it('should handle negative values', () => {
      expect(formatPercentage(-10, 1)).toBe('-10.0%');
    });
  });

  describe('formatNumber', () => {
    it('should format numbers with thousand separators', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1234)).toBe('1,234');
      expect(formatNumber(1000000)).toBe('1,000,000');
    });

    it('should handle small numbers', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(999)).toBe('999');
    });

    it('should handle negative numbers', () => {
      expect(formatNumber(-1000)).toBe('-1,000');
      expect(formatNumber(-1234567)).toBe('-1,234,567');
    });

    it('should handle decimal numbers', () => {
      expect(formatNumber(1234.56)).toBe('1,234.56');
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      // Set a fixed time for consistent testing
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    it('should format recent times as "just now"', () => {
      const recent = new Date('2024-01-15T11:59:30Z'); // 30 seconds ago

      expect(formatRelativeTime(recent)).toBe('just now');
    });

    it('should format minutes ago', () => {
      const oneMinuteAgo = new Date('2024-01-15T11:59:00Z');
      const twoMinutesAgo = new Date('2024-01-15T11:58:00Z');
      const fiftyNineMinutesAgo = new Date('2024-01-15T11:01:00Z');

      expect(formatRelativeTime(oneMinuteAgo)).toBe('1 minute ago');
      expect(formatRelativeTime(twoMinutesAgo)).toBe('2 minutes ago');
      expect(formatRelativeTime(fiftyNineMinutesAgo)).toBe('59 minutes ago');
    });

    it('should format hours ago', () => {
      const oneHourAgo = new Date('2024-01-15T11:00:00Z');
      const twoHoursAgo = new Date('2024-01-15T10:00:00Z');
      const twentyThreeHoursAgo = new Date('2024-01-14T13:00:00Z');

      expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
      expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago');
      expect(formatRelativeTime(twentyThreeHoursAgo)).toBe('23 hours ago');
    });

    it('should format days ago', () => {
      const oneDayAgo = new Date('2024-01-14T12:00:00Z');
      const twoDaysAgo = new Date('2024-01-13T12:00:00Z');
      const sixDaysAgo = new Date('2024-01-09T12:00:00Z');

      expect(formatRelativeTime(oneDayAgo)).toBe('1 day ago');
      expect(formatRelativeTime(twoDaysAgo)).toBe('2 days ago');
      expect(formatRelativeTime(sixDaysAgo)).toBe('6 days ago');
    });

    it('should format older dates as date string', () => {
      const oneWeekAgo = new Date('2024-01-08T12:00:00Z');
      const oneMonthAgo = new Date('2023-12-15T12:00:00Z');

      expect(formatRelativeTime(oneWeekAgo)).toBe(oneWeekAgo.toLocaleDateString());
      expect(formatRelativeTime(oneMonthAgo)).toBe(oneMonthAgo.toLocaleDateString());
    });

    it('should handle singular vs plural correctly', () => {
      const oneMinuteAgo = new Date('2024-01-15T11:59:00Z');
      const oneHourAgo = new Date('2024-01-15T11:00:00Z');
      const oneDayAgo = new Date('2024-01-14T12:00:00Z');

      expect(formatRelativeTime(oneMinuteAgo)).toBe('1 minute ago');
      expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
      expect(formatRelativeTime(oneDayAgo)).toBe('1 day ago');
    });
  });

  describe('formatCurrency', () => {
    it('should format USD by default', () => {
      expect(formatCurrency(0)).toBe('$0.00');
      expect(formatCurrency(100)).toBe('$100.00');
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should format different currencies', () => {
      expect(formatCurrency(100, 'EUR')).toBe('€100.00');
      expect(formatCurrency(100, 'GBP')).toBe('£100.00');
      expect(formatCurrency(100, 'JPY')).toBe('¥100');
    });

    it('should handle negative amounts', () => {
      expect(formatCurrency(-100)).toBe('-$100.00');
    });

    it('should handle large amounts', () => {
      expect(formatCurrency(1000000)).toBe('$1,000,000.00');
    });

    it('should handle decimal amounts', () => {
      expect(formatCurrency(99.99)).toBe('$99.99');
      expect(formatCurrency(0.01)).toBe('$0.01');
    });
  });

  describe('formatFileSize', () => {
    it('should use formatBytes function', () => {
      expect(formatFileSize(1024)).toBe(formatBytes(1024));
      expect(formatFileSize(1024 * 1024)).toBe(formatBytes(1024 * 1024));
    });
  });

  describe('formatCompressionRatio', () => {
    it('should format compression ratio as percentage', () => {
      expect(formatCompressionRatio(0.5)).toBe('50.0%');
      expect(formatCompressionRatio(0.75)).toBe('75.0%');
      expect(formatCompressionRatio(0.9)).toBe('90.0%');
    });

    it('should handle edge cases', () => {
      expect(formatCompressionRatio(0)).toBe('0.0%');
      expect(formatCompressionRatio(1)).toBe('100.0%');
    });
  });

  describe('formatNetworkSpeed', () => {
    it('should format bits per second', () => {
      expect(formatNetworkSpeed(100)).toBe('800 bps');
      expect(formatNetworkSpeed(125)).toBe('1.0 Kbps'); // 125 bytes/s = 1000 bps, crosses into Kbps threshold
    });

    it('should format kilobits per second', () => {
      expect(formatNetworkSpeed(1000)).toBe('8.0 Kbps');
      expect(formatNetworkSpeed(12500)).toBe('100.0 Kbps');
    });

    it('should format megabits per second', () => {
      expect(formatNetworkSpeed(125000)).toBe('1.0 Mbps');
      expect(formatNetworkSpeed(1250000)).toBe('10.0 Mbps');
    });

    it('should format gigabits per second', () => {
      expect(formatNetworkSpeed(125000000)).toBe('1.0 Gbps');
      expect(formatNetworkSpeed(1250000000)).toBe('10.0 Gbps');
    });

    it('should handle edge cases', () => {
      expect(formatNetworkSpeed(0)).toBe('0 bps');
      expect(formatNetworkSpeed(1)).toBe('8 bps');
    });

    it('should use decimal formatting correctly', () => {
      expect(formatNetworkSpeed(1562.5)).toBe('12.5 Kbps');
      expect(formatNetworkSpeed(156250)).toBe('1.3 Mbps');
    });
  });

  describe('Integration tests', () => {
    it('should handle all functions with zero values', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatDuration(0)).toBe('0ms');
      expect(formatPercentage(0)).toBe('0.0%');
      expect(formatNumber(0)).toBe('0');
      expect(formatCurrency(0)).toBe('$0.00');
      expect(formatCompressionRatio(0)).toBe('0.0%');
      expect(formatNetworkSpeed(0)).toBe('0 bps');
    });

    it('should handle negative values appropriately', () => {
      expect(formatPercentage(-10)).toBe('-10.0%');
      expect(formatNumber(-1000)).toBe('-1,000');
      expect(formatCurrency(-100)).toBe('-$100.00');
    });
  });

  describe('Performance considerations', () => {
    it('should handle multiple calls efficiently', () => {
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        formatBytes(i * 1024);
        formatDuration(i * 1000);
        formatPercentage(i);
        formatNumber(i * 1000);
        formatCurrency(i);
      }

      // Should complete without errors
      expect(true).toBe(true);
    });

    it('should not modify global objects', () => {
      const originalIntl = global.Intl;
      const originalDate = global.Date;

      formatBytes(1024);
      formatDuration(1000);
      formatPercentage(50);
      formatNumber(1000);
      formatRelativeTime(new Date());
      formatCurrency(100);
      formatNetworkSpeed(1000);

      expect(global.Intl).toBe(originalIntl);
      expect(global.Date).toBe(originalDate);
    });
  });
});
