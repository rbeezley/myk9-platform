import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClassEntries, getTrialEntries, getEntriesByArmband, triggerSync } from './entryDataLayer';
import type { Entry } from '../../stores/entryStore';

// Mock the underlying modules
vi.mock('../entryReplication', () => ({
  getEntriesFromReplicationCache: vi.fn(),
  triggerImmediateEntrySync: vi.fn(),
}));

vi.mock('../entryDataFetching', () => ({
  fetchClassEntriesFromDatabase: vi.fn(),
  fetchTrialEntriesFromDatabase: vi.fn(),
  fetchEntriesByArmbandFromDatabase: vi.fn(),
}));

// Import mocked functions for assertions
import { getEntriesFromReplicationCache, triggerImmediateEntrySync } from '../entryReplication';
import {
  fetchClassEntriesFromDatabase,
  fetchTrialEntriesFromDatabase,
  fetchEntriesByArmbandFromDatabase,
} from '../entryDataFetching';

describe('entryDataLayer', () => {
  // Mock data
  const mockEntry = {
    id: 1,
    entryId: 1,
    armband: 101,
    dogName: 'Test Dog',
    handlerName: 'Test Handler',
    className: 'Novice A',
    checkinStatus: 'checked-in' as const,
    status: 'no-status' as const,
    isScored: false,
    isInRing: false,
    exhibitorOrder: 1,
    trialId: 1,
    classId: 1,
    licenseKey: 'test-key',
  } as Entry;

  const mockEntries = [mockEntry];
  const licenseKey = 'test-license-key';

  beforeEach(() => {
    vi.clearAllMocks();
    // Silence console logs in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getClassEntries', () => {
    it('should return entries from cache when available', async () => {
      // Arrange
      vi.mocked(getEntriesFromReplicationCache).mockResolvedValue(mockEntries);

      // Act
      const result = await getClassEntries(123, licenseKey);

      // Assert
      expect(result).toEqual(mockEntries);
      expect(getEntriesFromReplicationCache).toHaveBeenCalledWith([123], 123, licenseKey);
      expect(fetchClassEntriesFromDatabase).not.toHaveBeenCalled();
    });

    it('should fall back to database when cache returns null', async () => {
      // Arrange
      vi.mocked(getEntriesFromReplicationCache).mockResolvedValue(null);
      vi.mocked(fetchClassEntriesFromDatabase).mockResolvedValue(mockEntries);

      // Act
      const result = await getClassEntries(123, licenseKey);

      // Assert
      expect(result).toEqual(mockEntries);
      expect(getEntriesFromReplicationCache).toHaveBeenCalledWith([123], 123, licenseKey);
      expect(fetchClassEntriesFromDatabase).toHaveBeenCalledWith([123], 123, licenseKey);
    });

    it('should handle array of class IDs', async () => {
      // Arrange
      vi.mocked(getEntriesFromReplicationCache).mockResolvedValue(mockEntries);

      // Act
      const result = await getClassEntries([123, 124], licenseKey);

      // Assert
      expect(result).toEqual(mockEntries);
      expect(getEntriesFromReplicationCache).toHaveBeenCalledWith([123, 124], 123, licenseKey);
    });

    it('should skip cache when useReplication is false', async () => {
      // Arrange
      vi.mocked(fetchClassEntriesFromDatabase).mockResolvedValue(mockEntries);

      // Act
      const result = await getClassEntries(123, licenseKey, { useReplication: false });

      // Assert
      expect(result).toEqual(mockEntries);
      expect(getEntriesFromReplicationCache).not.toHaveBeenCalled();
      expect(fetchClassEntriesFromDatabase).toHaveBeenCalledWith([123], 123, licenseKey);
    });

    it('should propagate errors from cache layer', async () => {
      // Arrange
      const error = new Error('Cache error');
      vi.mocked(getEntriesFromReplicationCache).mockRejectedValue(error);

      // Act & Assert
      await expect(getClassEntries(123, licenseKey)).rejects.toThrow('Cache error');
    });

    it('should propagate errors from database layer', async () => {
      // Arrange
      const error = new Error('Database error');
      vi.mocked(getEntriesFromReplicationCache).mockResolvedValue(null);
      vi.mocked(fetchClassEntriesFromDatabase).mockRejectedValue(error);

      // Act & Assert
      await expect(getClassEntries(123, licenseKey)).rejects.toThrow('Database error');
    });

    it('should respect enableLogging config', async () => {
      // Arrange
      vi.mocked(getEntriesFromReplicationCache).mockResolvedValue(mockEntries);
      const logSpy = vi.spyOn(console, 'log');

      // Act - with logging disabled
      await getClassEntries(123, licenseKey, { enableLogging: false });

      // Assert
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('getTrialEntries', () => {
    it('should fetch entries from database', async () => {
      // Arrange
      vi.mocked(fetchTrialEntriesFromDatabase).mockResolvedValue(mockEntries);

      // Act
      const result = await getTrialEntries(456, licenseKey);

      // Assert
      expect(result).toEqual(mockEntries);
      expect(fetchTrialEntriesFromDatabase).toHaveBeenCalledWith(456, licenseKey);
    });

    it('should propagate errors', async () => {
      // Arrange
      const error = new Error('Trial fetch error');
      vi.mocked(fetchTrialEntriesFromDatabase).mockRejectedValue(error);

      // Act & Assert
      await expect(getTrialEntries(456, licenseKey)).rejects.toThrow('Trial fetch error');
    });

    it('should log errors with DATA_LAYER prefix', async () => {
      // Arrange
      const error = new Error('Test error');
      vi.mocked(fetchTrialEntriesFromDatabase).mockRejectedValue(error);
      const errorSpy = vi.spyOn(console, 'error');

      // Act & Assert
      await expect(getTrialEntries(456, licenseKey)).rejects.toThrow('Test error');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DATA_LAYER]'),
        expect.any(Error)
      );
    });
  });

  describe('getEntriesByArmband', () => {
    it('should fetch entries by armband', async () => {
      // Arrange
      vi.mocked(fetchEntriesByArmbandFromDatabase).mockResolvedValue(mockEntries);

      // Act
      const result = await getEntriesByArmband(101, licenseKey);

      // Assert
      expect(result).toEqual(mockEntries);
      expect(fetchEntriesByArmbandFromDatabase).toHaveBeenCalledWith(101, licenseKey);
    });

    it('should return empty array when no entries found', async () => {
      // Arrange
      vi.mocked(fetchEntriesByArmbandFromDatabase).mockResolvedValue([]);

      // Act
      const result = await getEntriesByArmband(999, licenseKey);

      // Assert
      expect(result).toEqual([]);
    });

    it('should propagate errors', async () => {
      // Arrange
      const error = new Error('Armband lookup error');
      vi.mocked(fetchEntriesByArmbandFromDatabase).mockRejectedValue(error);

      // Act & Assert
      await expect(getEntriesByArmband(101, licenseKey)).rejects.toThrow('Armband lookup error');
    });
  });

  describe('triggerSync', () => {
    it('should trigger sync for entries table', async () => {
      // Arrange
      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await triggerSync('entries');

      // Assert
      expect(triggerImmediateEntrySync).toHaveBeenCalledWith('entries');
    });

    it('should trigger sync for results table', async () => {
      // Arrange
      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await triggerSync('results');

      // Assert
      expect(triggerImmediateEntrySync).toHaveBeenCalledWith('results');
    });

    it('should propagate sync errors', async () => {
      // Arrange
      const error = new Error('Sync error');
      vi.mocked(triggerImmediateEntrySync).mockRejectedValue(error);

      // Act & Assert
      await expect(triggerSync('entries')).rejects.toThrow('Sync error');
    });
  });

  describe('integration scenarios', () => {
    it('should handle cache hit -> no database call', async () => {
      // Arrange
      vi.mocked(getEntriesFromReplicationCache).mockResolvedValue(mockEntries);

      // Act
      await getClassEntries(123, licenseKey);

      // Assert
      expect(getEntriesFromReplicationCache).toHaveBeenCalledTimes(1);
      expect(fetchClassEntriesFromDatabase).not.toHaveBeenCalled();
    });

    it('should handle cache miss -> database fallback', async () => {
      // Arrange
      vi.mocked(getEntriesFromReplicationCache).mockResolvedValue(null);
      vi.mocked(fetchClassEntriesFromDatabase).mockResolvedValue(mockEntries);

      // Act
      await getClassEntries(123, licenseKey);

      // Assert
      expect(getEntriesFromReplicationCache).toHaveBeenCalledTimes(1);
      expect(fetchClassEntriesFromDatabase).toHaveBeenCalledTimes(1);
    });

    it('should support forced database query', async () => {
      // Arrange
      vi.mocked(fetchClassEntriesFromDatabase).mockResolvedValue(mockEntries);

      // Act
      await getClassEntries(123, licenseKey, { useReplication: false });

      // Assert
      expect(getEntriesFromReplicationCache).not.toHaveBeenCalled();
      expect(fetchClassEntriesFromDatabase).toHaveBeenCalledTimes(1);
    });
  });
});
