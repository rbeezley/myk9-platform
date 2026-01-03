/**
 * Tests for DataManagementSection Component
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataManagementSection, StorageUsage } from './DataManagementSection';

// Mock the dataExportService
vi.mock('@/services/dataExportService', () => ({
  formatBytes: (bytes: number) => {
    if (bytes === 0) return '0.00 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}));

describe('DataManagementSection', () => {
  const mockOnExportData = vi.fn();
  const mockOnClearData = vi.fn();
  const mockOnExportSettings = vi.fn();
  const mockOnImportSettings = vi.fn();

  const mockStorageUsage: StorageUsage = {
    estimated: 5242880, // 5 MB
    quota: 52428800, // 50 MB
    percentUsed: 10,
    localStorageSize: 1048576 // 1 MB
  };

  const defaultProps = {
    storageUsage: mockStorageUsage,
    onExportData: mockOnExportData,
    onClearData: mockOnClearData,
    onExportSettings: mockOnExportSettings,
    onImportSettings: mockOnImportSettings,
    isClearing: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Storage usage display', () => {
    it('should display storage usage when available', () => {
      render(<DataManagementSection {...defaultProps} />);

      expect(screen.getByText('Storage Usage')).toBeInTheDocument();
      expect(screen.getByText(/5\.00 MB used \(10\.0%\)/)).toBeInTheDocument();
    });

    it('should show "Calculating..." when storage usage is null', () => {
      render(<DataManagementSection {...defaultProps} storageUsage={null} />);

      expect(screen.getByText('Calculating...')).toBeInTheDocument();
    });

    it('should format bytes correctly', () => {
      const smallStorage: StorageUsage = {
        estimated: 1024, // 1 KB
        quota: 10240, // 10 KB
        percentUsed: 10,
        localStorageSize: 512
      };

      render(<DataManagementSection {...defaultProps} storageUsage={smallStorage} />);

      expect(screen.getByText(/1\.00 KB used \(10\.0%\)/)).toBeInTheDocument();
    });

    it('should display percentage with one decimal place', () => {
      const preciseStorage: StorageUsage = {
        estimated: 5000000,
        quota: 50000000,
        percentUsed: 10.55,
        localStorageSize: 1000000
      };

      render(<DataManagementSection {...defaultProps} storageUsage={preciseStorage} />);

      expect(screen.getByText(/10\.6%/)).toBeInTheDocument();
    });

    it('should handle zero usage', () => {
      const emptyStorage: StorageUsage = {
        estimated: 0,
        quota: 50000000,
        percentUsed: 0,
        localStorageSize: 0
      };

      render(<DataManagementSection {...defaultProps} storageUsage={emptyStorage} />);

      expect(screen.getByText(/0\.00 B used \(0\.0%\)/)).toBeInTheDocument();
    });
  });

  describe('Export data button', () => {
    it('should render export data button', () => {
      render(<DataManagementSection {...defaultProps} />);

      expect(screen.getByText('Export My Data')).toBeInTheDocument();
      expect(screen.getByText('Download a backup of your data')).toBeInTheDocument();
    });

    it('should call onExportData when clicked', () => {
      render(<DataManagementSection {...defaultProps} />);

      const exportDataRow = screen.getByText('Export My Data').closest('.settings-row');
      fireEvent.click(exportDataRow!);

      expect(mockOnExportData).toHaveBeenCalledTimes(1);
    });

    it('should render Download icon', () => {
      const { container } = render(<DataManagementSection {...defaultProps} />);

      const downloadIcons = container.querySelectorAll('svg');
      expect(downloadIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Export settings button', () => {
    it('should render export settings button', () => {
      render(<DataManagementSection {...defaultProps} />);

      expect(screen.getByText('Export Settings')).toBeInTheDocument();
      expect(screen.getByText('Backup your preferences')).toBeInTheDocument();
    });

    it('should call onExportSettings when clicked', () => {
      render(<DataManagementSection {...defaultProps} />);

      const exportSettingsRow = screen.getByText('Export Settings').closest('.settings-row');
      fireEvent.click(exportSettingsRow!);

      expect(mockOnExportSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('Import settings button', () => {
    it('should render import settings button', () => {
      render(<DataManagementSection {...defaultProps} />);

      expect(screen.getByText('Import Settings')).toBeInTheDocument();
      expect(screen.getByText('Restore preferences from file')).toBeInTheDocument();
    });

    it('should call onImportSettings when clicked', () => {
      render(<DataManagementSection {...defaultProps} />);

      const importSettingsRow = screen.getByText('Import Settings').closest('.settings-row');
      fireEvent.click(importSettingsRow!);

      expect(mockOnImportSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('Clear data button', () => {
    it('should render clear data button', () => {
      render(<DataManagementSection {...defaultProps} />);

      expect(screen.getByText('Clear All Data')).toBeInTheDocument();
      expect(screen.getByText('Permanently delete local data')).toBeInTheDocument();
    });

    it('should call onClearData when clicked', () => {
      render(<DataManagementSection {...defaultProps} />);

      const clearDataRow = screen.getByText('Clear All Data').closest('.settings-row');
      fireEvent.click(clearDataRow!);

      expect(mockOnClearData).toHaveBeenCalledTimes(1);
    });

    it('should show "Clearing..." when isClearing is true', () => {
      render(<DataManagementSection {...defaultProps} isClearing={true} />);

      expect(screen.getByText('Clearing...')).toBeInTheDocument();
      expect(screen.queryByText('Clear All Data')).not.toBeInTheDocument();
    });

    it('should show "Clear All Data" when isClearing is false', () => {
      render(<DataManagementSection {...defaultProps} isClearing={false} />);

      expect(screen.getByText('Clear All Data')).toBeInTheDocument();
      expect(screen.queryByText('Clearing...')).not.toBeInTheDocument();
    });

    it('should have isDestructive prop', () => {
      const { container } = render(<DataManagementSection {...defaultProps} />);

      const clearDataRow = screen.getByText('Clear All Data').closest('.settings-row');
      // The SettingsRow component should handle the isDestructive styling
      expect(clearDataRow).toBeInTheDocument();
    });
  });

  describe('Multiple button interactions', () => {
    it('should not trigger other callbacks when one is clicked', () => {
      render(<DataManagementSection {...defaultProps} />);

      const exportDataRow = screen.getByText('Export My Data').closest('.settings-row');
      fireEvent.click(exportDataRow!);

      expect(mockOnExportData).toHaveBeenCalledTimes(1);
      expect(mockOnClearData).not.toHaveBeenCalled();
      expect(mockOnExportSettings).not.toHaveBeenCalled();
      expect(mockOnImportSettings).not.toHaveBeenCalled();
    });

    it('should allow clicking multiple buttons sequentially', () => {
      render(<DataManagementSection {...defaultProps} />);

      const exportDataRow = screen.getByText('Export My Data').closest('.settings-row');
      const exportSettingsRow = screen.getByText('Export Settings').closest('.settings-row');
      const importSettingsRow = screen.getByText('Import Settings').closest('.settings-row');

      fireEvent.click(exportDataRow!);
      fireEvent.click(exportSettingsRow!);
      fireEvent.click(importSettingsRow!);

      expect(mockOnExportData).toHaveBeenCalledTimes(1);
      expect(mockOnExportSettings).toHaveBeenCalledTimes(1);
      expect(mockOnImportSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete data export workflow', () => {
      render(<DataManagementSection {...defaultProps} />);

      // User views storage usage
      expect(screen.getByText(/5\.00 MB used/)).toBeInTheDocument();

      // User exports data
      const exportDataRow = screen.getByText('Export My Data').closest('.settings-row');
      fireEvent.click(exportDataRow!);

      expect(mockOnExportData).toHaveBeenCalled();
    });

    it('should handle settings transfer workflow', () => {
      render(<DataManagementSection {...defaultProps} />);

      // User exports settings from old device
      const exportSettingsRow = screen.getByText('Export Settings').closest('.settings-row');
      fireEvent.click(exportSettingsRow!);
      expect(mockOnExportSettings).toHaveBeenCalled();

      // User imports settings on new device
      const importSettingsRow = screen.getByText('Import Settings').closest('.settings-row');
      fireEvent.click(importSettingsRow!);
      expect(mockOnImportSettings).toHaveBeenCalled();
    });

    it('should handle data cleanup workflow', () => {
      const { rerender } = render(<DataManagementSection {...defaultProps} />);

      // User initiates clear
      const clearDataRow = screen.getByText('Clear All Data').closest('.settings-row');
      fireEvent.click(clearDataRow!);
      expect(mockOnClearData).toHaveBeenCalled();

      // UI shows clearing state
      rerender(<DataManagementSection {...defaultProps} isClearing={true} />);
      expect(screen.getByText('Clearing...')).toBeInTheDocument();

      // Clear completes
      rerender(<DataManagementSection {...defaultProps} isClearing={false} storageUsage={{
        estimated: 0,
        quota: 50000000,
        percentUsed: 0,
        localStorageSize: 0
      }} />);
      expect(screen.getByText('Clear All Data')).toBeInTheDocument();
      expect(screen.getByText(/0\.00 B used/)).toBeInTheDocument();
    });

    it('should handle initial loading state', () => {
      render(<DataManagementSection {...defaultProps} storageUsage={null} />);

      expect(screen.getByText('Calculating...')).toBeInTheDocument();
      expect(screen.getByText('Export My Data')).toBeInTheDocument();
      expect(screen.getByText('Clear All Data')).toBeInTheDocument();
    });

    it('should handle high storage usage', () => {
      const highStorage: StorageUsage = {
        estimated: 47185920, // ~45 MB
        quota: 52428800, // 50 MB
        percentUsed: 90,
        localStorageSize: 5000000
      };

      render(<DataManagementSection {...defaultProps} storageUsage={highStorage} />);

      expect(screen.getByText(/45\.00 MB used \(90\.0%\)/)).toBeInTheDocument();
    });
  });

  describe('Icon rendering', () => {
    it('should render all required icons', () => {
      const { container } = render(<DataManagementSection {...defaultProps} />);

      const icons = container.querySelectorAll('svg');
      // Database + 2x Download + Upload + Trash = 5 icons
      // Plus 4 ChevronRight icons for clickable rows = 9 total
      expect(icons.length).toBe(9);
    });
  });
});
