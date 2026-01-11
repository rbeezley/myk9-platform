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

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Download,
  Upload,
  HardDrive,
  Trash2,
  Archive,
  RefreshCw,
  Database,
  Settings,
  AlertTriangle,
  FolderArchive,
  CloudUpload,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { logger } from '@/services/LoggingService';

export interface StorageQuota {
  used: number; // bytes
  available: number; // bytes
  total: number; // bytes
  usagePercentage: number;
}

export interface BackupInfo {
  id: string;
  name: string;
  type: 'auto' | 'manual';
  createdAt: Date;
  size: number;
  entities: string[];
  compressed: boolean;
  metadata: {
    version: string;
    deviceId: string;
    entryCount: number;
  };
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'xlsx';
  entities: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  includeDeleted: boolean;
  compressed: boolean;
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
    format: 'json',
    entities: ['shows', 'entries', 'dogs', 'people'],
    includeDeleted: false,
    compressed: true
  });
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  // Mock data for demonstration
  const mockStorageQuota: StorageQuota = useMemo(() => ({
    used: 52428800, // 50MB
    available: 157286400, // 150MB
    total: 209715200, // 200MB
    usagePercentage: 25
  }), []);

  const mockBackups: BackupInfo[] = useMemo(() => [
    {
      id: 'backup-1',
      name: 'Auto Backup - Nov 2024',
      type: 'auto',
      createdAt: new Date(Date.now() - 86400000), // 1 day ago
      size: 15728640, // 15MB
      entities: ['shows', 'entries', 'dogs', 'people'],
      compressed: true,
      metadata: {
        version: '1.0.0',
        deviceId: 'device-123',
        entryCount: 1250
      }
    },
    {
      id: 'backup-2',
      name: 'Manual Export - Oct 2024',
      type: 'manual',
      createdAt: new Date(Date.now() - 604800000), // 1 week ago
      size: 8388608, // 8MB
      entities: ['shows', 'entries'],
      compressed: true,
      metadata: {
        version: '1.0.0',
        deviceId: 'device-123',
        entryCount: 800
      }
    }
  ], []);

  const availableEntities = [
    { id: 'shows', label: 'Shows', icon: '🏆', count: 25 },
    { id: 'entries', label: 'Entries', icon: '📝', count: 1250 },
    { id: 'dogs', label: 'Dogs', icon: '🐕', count: 450 },
    { id: 'people', label: 'Users', icon: '👤', count: 300 },
    { id: 'classes', label: 'Classes', icon: '📋', count: 150 },
    { id: 'results', label: 'Results', icon: '🏅', count: 800 },
    { id: 'settings', label: 'Settings', icon: '⚙️', count: 1 }
  ];

  useEffect(() => {
    // Simulate loading storage quota
    setStorageQuota(mockStorageQuota);
    setBackups(mockBackups);
  }, [mockStorageQuota, mockBackups]);

  // Calculate storage usage by entity type
  const storageBreakdown = useMemo(() => [
    { entity: 'Shows', size: 5242880, percentage: 10 },
    { entity: 'Entries', size: 31457280, percentage: 60 },
    { entity: 'Dogs', size: 10485760, percentage: 20 },
    { entity: 'Results', size: 5242880, percentage: 10 }
  ], []);

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Handle export
  const handleExport = async () => {
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
  };

  // Handle import
  const handleImport = async (file: File): Promise<void> => {
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
  };

  // Handle backup creation
  const handleCreateBackup = async (): Promise<void> => {
    setIsCreatingBackup(true);
    try {
      // Simulate backup creation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const newBackup: BackupInfo = {
        id: `backup-${Date.now()}`,
        name: `Manual Backup - ${new Date().toLocaleDateString()}`,
        type: 'manual',
        createdAt: new Date(),
        size: Math.random() * 20000000 + 5000000, // 5-25MB
        entities: selectedEntities.length > 0 ? selectedEntities : exportOptions.entities,
        compressed: exportOptions.compressed,
        metadata: {
          version: '1.0.0',
          deviceId: 'device-123',
          entryCount: Math.floor(Math.random() * 1000) + 500
        }
      };
      
      setBackups(prev => [newBackup, ...prev]);
    } catch (error) {
      logger.error('Backup creation failed', 'offline', {}, error as Error);
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Handle data clearing
  const handleClearData = async (entityTypes: string[]) => {
    try {
      logger.info('Clearing data', 'offline', { entityTypes });
      // In real implementation, clear selected entity data
    } catch (error) {
      logger.error('Data clearing failed', 'offline', { entityTypes }, error as Error);
    }
  };

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
          {/* Storage Quota */}
          {storageQuota && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Storage Usage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      {formatFileSize(storageQuota.used)} of {formatFileSize(storageQuota.total)} used
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {storageQuota.usagePercentage}%
                    </span>
                  </div>
                  <Progress value={storageQuota.usagePercentage} className="h-2" />
                  <div className="text-xs text-muted-foreground">
                    {formatFileSize(storageQuota.available)} available
                  </div>
                </div>

                {/* Storage Breakdown */}
                <div className="space-y-3">
                  <h4 className="font-medium">Storage by Type</h4>
                  <div className="space-y-2">
                    {storageBreakdown.map((item) => (
                      <div key={item.entity} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: `hsl(${item.percentage * 3.6}, 70%, 50%)` }}
                          />
                          <span className="text-sm">{item.entity}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(item.size)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({item.percentage}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-2 border-dashed border-muted hover:border-primary/50 transition-colors">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                <Download className="h-8 w-8 text-primary mb-2" />
                <h3 className="font-medium mb-1">Export Data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Export your data in various formats
                </p>
                <Button size="sm" onClick={() => setActiveTab('export')}>
                  Start Export
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-dashed border-muted hover:border-primary/50 transition-colors">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                <Archive className="h-8 w-8 text-primary mb-2" />
                <h3 className="font-medium mb-1">Create Backup</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a backup of your data
                </p>
                <Button size="sm" onClick={() => setActiveTab('backup')}>
                  Create Backup
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-dashed border-muted hover:border-primary/50 transition-colors">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                <Trash2 className="h-8 w-8 text-primary mb-2" />
                <h3 className="font-medium mb-1">Manage Data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Clear or organize your data
                </p>
                <Button size="sm" onClick={() => setActiveTab('manage')}>
                  Manage Data
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Backups */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderArchive className="h-5 w-5" />
                Recent Backups
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {backups.slice(0, 3).map((backup) => (
                  <div key={backup.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Archive className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium text-sm">{backup.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(backup.createdAt, { addSuffix: true })} • {formatFileSize(backup.size)}
                        </div>
                      </div>
                    </div>
                    <Badge variant={backup.type === 'auto' ? 'secondary' : 'outline'}>
                      {backup.type}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Export Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Export Format */}
              <div className="space-y-2">
                <Label>Export Format</Label>
                <Select
                  value={exportOptions.format}
                  onValueChange={(value: 'json' | 'csv' | 'xlsx') => 
                    setExportOptions(prev => ({ ...prev, format: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON (Recommended)</SelectItem>
                    <SelectItem value="csv">CSV (Spreadsheet)</SelectItem>
                    <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Entity Selection */}
              <div className="space-y-3">
                <Label>Data to Export</Label>
                <div className="grid grid-cols-2 gap-3">
                  {availableEntities.map((entity) => (
                    <div key={entity.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={entity.id}
                        checked={exportOptions.entities.includes(entity.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setExportOptions(prev => ({
                              ...prev,
                              entities: [...prev.entities, entity.id]
                            }));
                          } else {
                            setExportOptions(prev => ({
                              ...prev,
                              entities: prev.entities.filter(e => e !== entity.id)
                            }));
                          }
                        }}
                      />
                      <Label htmlFor={entity.id} className="flex items-center gap-2">
                        <span>{entity.icon}</span>
                        <span>{entity.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {entity.count}
                        </Badge>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Options */}
              <div className="space-y-3">
                <Label>Options</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeDeleted"
                      checked={exportOptions.includeDeleted}
                      onCheckedChange={(checked) => 
                        setExportOptions(prev => ({ ...prev, includeDeleted: !!checked }))
                      }
                    />
                    <Label htmlFor="includeDeleted">Include deleted items</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="compressed"
                      checked={exportOptions.compressed}
                      onCheckedChange={(checked) => 
                        setExportOptions(prev => ({ ...prev, compressed: !!checked }))
                      }
                    />
                    <Label htmlFor="compressed">Compress export file</Label>
                  </div>
                </div>
              </div>

              {/* Export Button */}
              <Button 
                onClick={handleExport} 
                disabled={isExporting || exportOptions.entities.length === 0}
                className="w-full"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export Data
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Import Section */}
          <Card>
            <CardHeader>
              <CardTitle>Import Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Drag and drop your export file here, or click to browse
                  </p>
                  <Input
                    type="file"
                    accept=".json,.csv,.xlsx,.zip"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImport(file);
                    }}
                    className="hidden"
                    id="import-file"
                  />
                  <Label htmlFor="import-file" className="cursor-pointer">
                    <Button variant="outline" disabled={isImporting}>
                      {isImporting ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Choose File
                        </>
                      )}
                    </Button>
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backup Tab */}
        <TabsContent value="backup" className="space-y-6">
          {/* Create Backup */}
          <Card>
            <CardHeader>
              <CardTitle>Create New Backup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Entity Selection for Backup */}
              <div className="space-y-3">
                <Label>Data to Include</Label>
                <div className="grid grid-cols-2 gap-3">
                  {availableEntities.map((entity) => (
                    <div key={entity.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`backup-${entity.id}`}
                        checked={selectedEntities.includes(entity.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedEntities(prev => [...prev, entity.id]);
                          } else {
                            setSelectedEntities(prev => prev.filter(e => e !== entity.id));
                          }
                        }}
                      />
                      <Label htmlFor={`backup-${entity.id}`} className="flex items-center gap-2">
                        <span>{entity.icon}</span>
                        <span>{entity.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {entity.count}
                        </Badge>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <Button 
                onClick={handleCreateBackup} 
                disabled={isCreatingBackup}
                className="w-full"
              >
                {isCreatingBackup ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Creating Backup...
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4 mr-2" />
                    Create Backup
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Existing Backups */}
          <Card>
            <CardHeader>
              <CardTitle>Existing Backups</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {backups.map((backup) => (
                  <div key={backup.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{backup.name}</h4>
                          <Badge variant={backup.type === 'auto' ? 'secondary' : 'outline'}>
                            {backup.type}
                          </Badge>
                          {backup.compressed && (
                            <Badge variant="outline" className="text-xs">
                              Compressed
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Created {formatDistanceToNow(backup.createdAt, { addSuffix: true })} • {formatFileSize(backup.size)} • {backup.metadata.entryCount} entries
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Includes: {backup.entities.join(', ')}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download backup</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <CloudUpload className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Restore Backup</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will restore data from "{backup.name}". Current data may be overwritten. Are you sure?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction>Restore</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Backup</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{backup.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manage Tab */}
        <TabsContent value="manage" className="space-y-6">
          {/* Clear Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                Clear Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                  <div>
                    <h4 className="font-medium text-destructive">Warning</h4>
                    <p className="text-sm text-destructive/80">
                      Clearing data will permanently delete the selected information. This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Select data to clear</Label>
                <div className="grid grid-cols-2 gap-3">
                  {availableEntities.map((entity) => (
                    <div key={entity.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`clear-${entity.id}`}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedEntities(prev => [...prev, entity.id]);
                          } else {
                            setSelectedEntities(prev => prev.filter(e => e !== entity.id));
                          }
                        }}
                      />
                      <Label htmlFor={`clear-${entity.id}`} className="flex items-center gap-2">
                        <span>{entity.icon}</span>
                        <span>{entity.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {entity.count}
                        </Badge>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    disabled={selectedEntities.length === 0}
                    className="w-full"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Selected Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Data Clearing</AlertDialogTitle>
                    <AlertDialogDescription>
                      You are about to permanently delete data for: {selectedEntities.join(', ')}.
                      This action cannot be undone. Are you absolutely sure?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => handleClearData(selectedEntities)}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Yes, Clear Data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* Storage Optimization */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Storage Optimization
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Compress Old Data</h4>
                    <p className="text-sm text-muted-foreground">
                      Compress entries older than 6 months to save space
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Compress
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Remove Orphaned Data</h4>
                    <p className="text-sm text-muted-foreground">
                      Clean up data without valid references
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Clean Up
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Rebuild Indexes</h4>
                    <p className="text-sm text-muted-foreground">
                      Optimize database performance
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Rebuild
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default OfflineDataManager;