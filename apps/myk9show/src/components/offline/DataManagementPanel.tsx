import React, { useState } from 'react';
import { logger } from '@/services/LoggingService';
import {
  Database, 
  Download, 
  Upload, 
  Trash2, 
  FileText,
  Shield,
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { StorageUsageMonitor } from './StorageUsageMonitor';
import { DataExportDialog } from './DataExportDialog';
import { ReportGenerationDialog } from './ReportGenerationDialog';
import { 
  dataBackupService, 
  BackupOptions, 
  BackupResult, 
  RestoreResult 
} from '../../services/offline/DataBackupService';

interface DataManagementPanelProps {
  className?: string;
}

export const DataManagementPanel: React.FC<DataManagementPanelProps> = ({
  className = ''
}) => {
  const [backupOptions, setBackupOptions] = useState<BackupOptions>({
    includeMetadata: true,
    compressData: true,
    includeUserPreferences: true,
    includeCache: false
  });
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [cleanupInProgress, setCleanupInProgress] = useState(false);
  const [lastCleanup, setLastCleanup] = useState<{
    itemsRemoved: number;
    spaceFreed: number;
    summary: string[];
  } | null>(null);

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    setBackupResult(null);
    
    try {
      const result = await dataBackupService.createBackup(backupOptions);
      setBackupResult(result);
    } catch (error) {
      logger.error('Backup creation error:', 'components', {}, error as Error);
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (file: File) => {
    setIsRestoring(true);
    setRestoreResult(null);
    
    try {
      const result = await dataBackupService.restoreFromBackup(file, {
        mergeWithExisting: true
      });
      setRestoreResult(result);
    } catch (error) {
      logger.error('Restore error:', 'components', {}, error as Error);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCleanupData = async () => {
    setCleanupInProgress(true);
    
    try {
      const result = await dataBackupService.cleanupOldData({
        removeOldShows: true,
        oldShowsThresholdDays: 365,
        removeCache: true,
        removeCompletedEntries: false
      });
      setLastCleanup(result);
    } catch (error) {
      logger.error('Cleanup error:', 'components', {}, error as Error);
    } finally {
      setCleanupInProgress(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Storage Overview */}
      <StorageUsageMonitor 
        showBreakdown={true}
        onCleanupNeeded={handleCleanupData}
      />

      <Tabs defaultValue="backup" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
        </TabsList>

        {/* Backup Tab */}
        <TabsContent value="backup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Data Backup
              </CardTitle>
              <CardDescription>
                Create and restore complete backups of your show data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Create Backup Section */}
              <div className="space-y-4">
                <h4 className="font-medium">Create Backup</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeMetadata"
                        checked={backupOptions.includeMetadata}
                        onCheckedChange={(checked) =>
                          setBackupOptions(prev => ({ ...prev, includeMetadata: checked as boolean }))
                        }
                      />
                      <Label htmlFor="includeMetadata">Include metadata</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="compressData"
                        checked={backupOptions.compressData}
                        onCheckedChange={(checked) =>
                          setBackupOptions(prev => ({ ...prev, compressData: checked as boolean }))
                        }
                      />
                      <Label htmlFor="compressData">Compress backup</Label>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includePreferences"
                        checked={backupOptions.includeUserPreferences}
                        onCheckedChange={(checked) =>
                          setBackupOptions(prev => ({ ...prev, includeUserPreferences: checked as boolean }))
                        }
                      />
                      <Label htmlFor="includePreferences">Include preferences</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeCache"
                        checked={backupOptions.includeCache}
                        onCheckedChange={(checked) =>
                          setBackupOptions(prev => ({ ...prev, includeCache: checked as boolean }))
                        }
                      />
                      <Label htmlFor="includeCache">Include cache data</Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backupFilename">Custom filename (optional)</Label>
                  <Input
                    id="backupFilename"
                    placeholder="Leave empty for auto-generated name"
                    value={backupOptions.filename || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value) {
                        setBackupOptions(prev => ({ ...prev, filename: value }));
                      } else {
                        const { filename: _, ...rest } = backupOptions;
                        void _;
                        setBackupOptions(rest);
                      }
                    }}
                  />
                </div>

                <Button
                  onClick={handleCreateBackup}
                  disabled={isCreatingBackup}
                  className="w-full gap-2"
                >
                  {isCreatingBackup ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Creating Backup...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Create Backup
                    </>
                  )}
                </Button>

                {backupResult && (
                  <Alert className={backupResult.success ? 'border-success-green' : 'border-error-red'}>
                    <div className="flex items-center gap-2">
                      {backupResult.success ? (
                        <CheckCircle className="h-4 w-4 text-success-green" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-error-red" />
                      )}
                    </div>
                    <AlertDescription>
                      {backupResult.success ? (
                        <div>
                          <div className="font-medium">Backup created successfully!</div>
                          <div className="text-sm mt-1">
                            File: {backupResult.filename} ({formatFileSize(backupResult.fileSize)})
                            <br />
                            Items: {backupResult.itemCount.toLocaleString()}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium">Backup failed</div>
                          <div className="text-sm mt-1">{backupResult.error}</div>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <Separator />

              {/* Restore Backup Section */}
              <div className="space-y-4">
                <h4 className="font-medium">Restore Backup</h4>
                
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <div className="font-medium mb-2">Drop backup file here</div>
                  <div className="text-sm text-muted-foreground mb-4">
                    Supports .json and .zip backup files
                  </div>
                  <Input
                    type="file"
                    accept=".json,.zip"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleRestoreBackup(file);
                    }}
                    className="max-w-xs mx-auto"
                  />
                </div>

                {isRestoring && (
                  <div className="text-center">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <div>Restoring backup...</div>
                  </div>
                )}

                {restoreResult && (
                  <Alert className={restoreResult.success ? 'border-success-green' : 'border-error-red'}>
                    <div className="flex items-center gap-2">
                      {restoreResult.success ? (
                        <CheckCircle className="h-4 w-4 text-success-green" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-error-red" />
                      )}
                    </div>
                    <AlertDescription>
                      <div>
                        <div className="font-medium">
                          {restoreResult.success ? 'Restore completed' : 'Restore failed'}
                        </div>
                        <div className="text-sm mt-1">
                          Items restored: {restoreResult.itemsRestored.toLocaleString()}
                        </div>
                        {restoreResult.warnings.length > 0 && (
                          <div className="text-sm mt-2">
                            <div className="font-medium">Warnings:</div>
                            {restoreResult.warnings.map((warning, index) => (
                              <div key={index}>• {warning}</div>
                            ))}
                          </div>
                        )}
                        {restoreResult.errors.length > 0 && (
                          <div className="text-sm mt-2">
                            <div className="font-medium">Errors:</div>
                            {restoreResult.errors.map((error, index) => (
                              <div key={index}>• {error}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Export
              </CardTitle>
              <CardDescription>
                Export specific data types in various formats
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">Export Your Data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose specific data types and export formats for your needs
                </p>
                <DataExportDialog
                  trigger={
                    <Button className="gap-2">
                      <Download className="h-4 w-4" />
                      Start Export
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Report Generation
              </CardTitle>
              <CardDescription>
                Generate professional reports for shows and events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">Generate Reports</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create entry lists, judge books, results, and more
                </p>
                <ReportGenerationDialog
                  showId="mock-show-id"
                  trigger={
                    <Button className="gap-2">
                      <FileText className="h-4 w-4" />
                      Create Report
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cleanup Tab */}
        <TabsContent value="cleanup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Data Cleanup
              </CardTitle>
              <CardDescription>
                Free up storage space by removing old or unnecessary data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">Remove old shows</div>
                    <div className="text-sm text-muted-foreground">
                      Delete shows older than 1 year
                    </div>
                  </div>
                  <Badge variant="secondary">Safe</Badge>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">Clear cache data</div>
                    <div className="text-sm text-muted-foreground">
                      Remove temporary files and cached data
                    </div>
                  </div>
                  <Badge variant="secondary">Safe</Badge>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg opacity-50">
                  <div>
                    <div className="font-medium">Remove completed entries</div>
                    <div className="text-sm text-muted-foreground">
                      Delete entries from completed shows
                    </div>
                  </div>
                  <Badge variant="outline">Disabled</Badge>
                </div>
              </div>

              <Button
                onClick={handleCleanupData}
                disabled={cleanupInProgress}
                variant="outline"
                className="w-full gap-2"
              >
                {cleanupInProgress ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Cleaning up...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Start Cleanup
                  </>
                )}
              </Button>

              {lastCleanup && (
                <Alert className="border-success-green">
                  <CheckCircle className="h-4 w-4 text-success-green" />
                  <AlertDescription>
                    <div>
                      <div className="font-medium">Cleanup completed!</div>
                      <div className="text-sm mt-1">
                        Removed {lastCleanup.itemsRemoved} items, freed {formatFileSize(lastCleanup.spaceFreed)}
                      </div>
                      {lastCleanup.summary.length > 0 && (
                        <div className="text-sm mt-2">
                          {lastCleanup.summary.map((item, index) => (
                            <div key={index}>• {item}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};