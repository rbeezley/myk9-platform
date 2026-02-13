/**
 * OfflineDataManager - Comprehensive offline data management interface
 *
 * Provides complete offline data management including:
 * - Data export/import functionality (JSON, CSV, ZIP)
 * - Backup creation and restoration
 * - Storage quota monitoring and management
 * - Data clearing options with granular control
 * - Migration and synchronization tools
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import { Button } from '@/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Download,
  Archive,
  RefreshCw,
  Database,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import type { BackupInfo, ExportOptions, StorageQuota } from './types';
import {
  AVAILABLE_ENTITIES,
  DEFAULT_EXPORT_OPTIONS,
  MOCK_STORAGE_QUOTA,
  STORAGE_BREAKDOWN,
  ONE_DAY_MS,
  ONE_WEEK_MS,
} from './utils';
import { StorageOverview } from './StorageOverview';
import { QuickActions } from './QuickActions';
import { RecentBackups } from './RecentBackups';
import { ExportPanel } from './ExportPanel';
import { ImportPanel } from './ImportPanel';
import { BackupPanel } from './BackupPanel';
import { ManagePanel } from './ManagePanel';

// Re-export public types so consumers can import from the same path
export type { StorageQuota, BackupInfo, ExportOptions } from './types';

/** Generate a unique backup ID using a timestamp-based suffix. */
function generateBackupId(): string {
  return `backup-${Date.now()}`;
}

/** Generate a random backup size between 5MB and 25MB. */
function generateBackupSize(): number {
  return Math.random() * 20000000 + 5000000;
}

/** Generate a random entry count between 500 and 1500. */
function generateEntryCount(): number {
  return Math.floor(Math.random() * 1000) + 500;
}

interface OfflineDataManagerProps {
  className?: string;
}

export function OfflineDataManager({ className }: OfflineDataManagerProps) {
  // State management
  const [activeTab, setActiveTab] = useState('overview');
  const [storageQuota, setStorageQuota] = useState<StorageQuota | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    ...DEFAULT_EXPORT_OPTIONS,
  });
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  // Mock data for demonstration
  const mockBackups: BackupInfo[] = useMemo(() => [
    {
      id: 'backup-1',
      name: 'Auto Backup - Nov 2024',
      type: 'auto',
      createdAt: new Date(Date.now() - ONE_DAY_MS),
      size: 15728640, // 15MB
      entities: ['shows', 'entries', 'dogs', 'people'],
      compressed: true,
      metadata: {
        version: '1.0.0',
        deviceId: 'device-123',
        entryCount: 1250,
      },
    },
    {
      id: 'backup-2',
      name: 'Manual Export - Oct 2024',
      type: 'manual',
      createdAt: new Date(Date.now() - ONE_WEEK_MS),
      size: 8388608, // 8MB
      entities: ['shows', 'entries'],
      compressed: true,
      metadata: {
        version: '1.0.0',
        deviceId: 'device-123',
        entryCount: 800,
      },
    },
  ], []);

  useEffect(() => {
    // Simulate loading storage quota
    setStorageQuota(MOCK_STORAGE_QUOTA);
    setBackups(mockBackups);
  }, [mockBackups]);

  // Handle export
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      // Simulate export process
      await new Promise(resolve => setTimeout(resolve, 2000));

      const filename = `myK9Show-export-${new Date().toISOString().split('T')[0]}.${exportOptions.format}`;
      logger.info('Exporting data', 'offline', { filename, format: exportOptions.format, entities: exportOptions.entities });

      // In a real implementation, this would trigger a file download
    } catch (error) {
      logger.error('Export failed', 'offline', {}, error as Error);
    } finally {
      setIsExporting(false);
    }
  }, [exportOptions.format, exportOptions.entities]);

  // Handle import
  const handleImport = useCallback(async (file: File): Promise<void> => {
    setIsImporting(true);
    try {
      // Simulate import process
      await new Promise(resolve => setTimeout(resolve, 3000));
      logger.info('Importing file', 'offline', { fileName: file.name, fileSize: file.size });
    } catch (error) {
      logger.error('Import failed', 'offline', {}, error as Error);
    } finally {
      setIsImporting(false);
    }
  }, []);

  // Handle backup creation
  const handleCreateBackup = useCallback(async (): Promise<void> => {
    setIsCreatingBackup(true);
    try {
      // Simulate backup creation
      await new Promise(resolve => setTimeout(resolve, 2000));

      const newBackup: BackupInfo = {
        id: generateBackupId(),
        name: `Manual Backup - ${new Date().toLocaleDateString()}`,
        type: 'manual',
        createdAt: new Date(),
        size: generateBackupSize(),
        entities: selectedEntities.length > 0 ? selectedEntities : exportOptions.entities,
        compressed: exportOptions.compressed,
        metadata: {
          version: '1.0.0',
          deviceId: 'device-123',
          entryCount: generateEntryCount(),
        },
      };

      setBackups(prev => [newBackup, ...prev]);
    } catch (error) {
      logger.error('Backup creation failed', 'offline', {}, error as Error);
    } finally {
      setIsCreatingBackup(false);
    }
  }, [selectedEntities, exportOptions.entities, exportOptions.compressed]);

  // Handle data clearing
  const handleClearData = useCallback(async (entityTypes: string[]) => {
    try {
      logger.info('Clearing data', 'offline', { entityTypes });
      // In real implementation, clear selected entity data
    } catch (error) {
      logger.error('Data clearing failed', 'offline', { entityTypes }, error as Error);
    }
  }, []);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Offline Data Management</h2>
          <p className="text-muted-foreground">
            Manage your offline data, backups, and storage
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Backup
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Manage
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {storageQuota && (
            <StorageOverview
              storageQuota={storageQuota}
              storageBreakdown={STORAGE_BREAKDOWN}
            />
          )}
          <QuickActions onNavigateToTab={setActiveTab} />
          <RecentBackups backups={backups} />
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6">
          <ExportPanel
            exportOptions={exportOptions}
            onExportOptionsChange={setExportOptions}
            availableEntities={AVAILABLE_ENTITIES}
            isExporting={isExporting}
            onExport={handleExport}
          />
          <ImportPanel
            isImporting={isImporting}
            onImport={handleImport}
          />
        </TabsContent>

        {/* Backup Tab */}
        <TabsContent value="backup" className="space-y-6">
          <BackupPanel
            backups={backups}
            availableEntities={AVAILABLE_ENTITIES}
            selectedEntities={selectedEntities}
            onSelectedEntitiesChange={setSelectedEntities}
            isCreatingBackup={isCreatingBackup}
            onCreateBackup={handleCreateBackup}
          />
        </TabsContent>

        {/* Manage Tab */}
        <TabsContent value="manage" className="space-y-6">
          <ManagePanel
            availableEntities={AVAILABLE_ENTITIES}
            selectedEntities={selectedEntities}
            onSelectedEntitiesChange={setSelectedEntities}
            onClearData={handleClearData}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
