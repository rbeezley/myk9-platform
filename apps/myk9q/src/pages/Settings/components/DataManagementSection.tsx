/**
 * DataManagementSection Component
 *
 * Displays storage usage and provides data management controls
 * (export, import, clear data).
 *
 * Extracted from AdvancedSettings.tsx
 */

import React from 'react';
import { SettingsRow } from './SettingsRow';
import { Database, Download, Trash2, Upload } from 'lucide-react';
import { formatBytes } from '@/services/dataExportService';

/**
 * Storage usage information
 */
export interface StorageUsage {
  /** Estimated storage used in bytes */
  estimated: number;
  /** Storage quota in bytes */
  quota: number;
  /** Percentage of quota used (0-100) */
  percentUsed: number;
  /** LocalStorage size in bytes */
  localStorageSize: number;
}

/**
 * Props for DataManagementSection component
 */
export interface DataManagementSectionProps {
  /** Current storage usage stats, null if still calculating */
  storageUsage: StorageUsage | null;
  /** Handler for exporting user data */
  onExportData: () => void;
  /** Handler for clearing all data */
  onClearData: () => void;
  /** Handler for exporting settings */
  onExportSettings: () => void;
  /** Handler for importing settings */
  onImportSettings: () => void;
  /** Whether clear data operation is in progress */
  isClearing: boolean;
}

/**
 * DataManagementSection Component
 *
 * Provides data management controls for:
 * - Viewing storage usage statistics
 * - Exporting competition data
 * - Exporting/importing settings
 * - Clearing all local data
 *
 * **Features:**
 * - Real-time storage usage display with formatting
 * - Separate export for data vs. settings
 * - Import/restore settings from file
 * - Destructive clear action with visual warning
 * - Loading state during clear operation
 *
 * **Use Cases:**
 * - Backing up competition data before major changes
 * - Transferring settings between devices
 * - Freeing up storage space
 * - Troubleshooting data corruption
 * - GDPR compliance (data export/deletion)
 *
 * @example
 * ```tsx
 * <DataManagementSection
 *   storageUsage={storageUsage}
 *   onExportData={handleExportData}
 *   onClearData={() => setShowClearConfirm(true)}
 *   onExportSettings={handleExportSettings}
 *   onImportSettings={handleImportClick}
 *   isClearing={false}
 * />
 * ```
 */
export function DataManagementSection({
  storageUsage,
  onExportData,
  onClearData,
  onExportSettings,
  onImportSettings,
  isClearing
}: DataManagementSectionProps): React.ReactElement {
  return (
    <>
      {/* Storage Usage Display */}
      <SettingsRow
        icon={<Database size={20} />}
        label="Storage Usage"
        description={
          storageUsage
            ? `${formatBytes(storageUsage.estimated)} used (${storageUsage.percentUsed.toFixed(1)}%)`
            : 'Calculating...'
        }
      />

      {/* Export My Data */}
      <SettingsRow
        icon={<Download size={20} />}
        label="Export My Data"
        description="Download a backup of your data"
        onClick={onExportData}
      />

      {/* Export Settings */}
      <SettingsRow
        icon={<Download size={20} />}
        label="Export Settings"
        description="Backup your preferences"
        onClick={onExportSettings}
      />

      {/* Import Settings */}
      <SettingsRow
        icon={<Upload size={20} />}
        label="Import Settings"
        description="Restore preferences from file"
        onClick={onImportSettings}
      />

      {/* Clear All Data */}
      <SettingsRow
        icon={<Trash2 size={20} />}
        label={isClearing ? "Clearing..." : "Clear All Data"}
        description="Permanently delete local data"
        isDestructive
        onClick={onClearData}
      />
    </>
  );
}
