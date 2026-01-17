/**
 * Data Lifecycle Management Dashboard
 * 
 * Admin interface for managing data archiving, retention policies,
 * orphaned record cleanup, and data export/import operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Archive,
  Database,
  FileText,
  Download,
  Upload,
  Trash2,
  Settings,
  Activity,
  HardDrive,
  Clock,
  Shield,
  AlertTriangle,
  CheckCircle,
  Play,
  Pause,
  RotateCcw,
  Users,
  Home,
  RefreshCw,
  X
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { getArchiveService, type ArchiveStats } from '@/services/data-lifecycle/DataArchiveService';
import { getArchiveScheduler } from '@/services/data-lifecycle/ArchiveScheduler';
import { getRetentionPolicyManager } from '@/services/data-lifecycle/DataRetentionPolicy';
import { getOrphanedRecordsCleaner, type CleanupReport } from '@/services/data-lifecycle/OrphanedRecordsCleaner';
import { getDataExportImportService } from '@/services/data-lifecycle/DataExportImport';

// Import soft delete management functions
import { getDeletedClubs, restoreClub, hardDeleteClub } from '@/services/database/queries/clubQueries';
import { getDeletedDogs, restoreDog, hardDeleteDog } from '@/services/database/queries/dogQueries';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';

export function DataLifecycleManagement() {
  const [archiveStats, setArchiveStats] = useState<ArchiveStats | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<Record<string, unknown> | null>(null);
  const [lastCleanupReport, setLastCleanupReport] = useState<CleanupReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Soft delete management state  
  const [deletedClubs, setDeletedClubs] = useState<Array<{ id: string; name: string | null; deleted_at: string | null; deleted_by_user?: { email?: string } | null }>>([]);
  const [deletedDogs, setDeletedDogs] = useState<Array<{ id: string; name: string; breed: string; deleted_at: string | null; deleted_by_user?: { email?: string } | null }>>([]);
  const [isLoadingDeleted, setIsLoadingDeleted] = useState(false);
  const { userWithRoles } = useAuthContext();
  
  // Confirmation dialog state
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{id: string, name: string, type: 'club' | 'dog'} | null>(null);

  const archiveService = getArchiveService();
  const scheduler = getArchiveScheduler();
  const policyManager = getRetentionPolicyManager();
  const exportService = getDataExportImportService();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [stats, status] = await Promise.all([
        archiveService.getArchiveStats(),
        Promise.resolve(scheduler.getStatus()),
      ]);
      
      setArchiveStats(stats);
      setSchedulerStatus(status);
    } catch (error) {
      logger.error('Failed to load data', 'data-lifecycle', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [archiveService, scheduler]);

  useEffect(() => {
    loadData();
  }, [loadData]);
  
  useEffect(() => {
    loadDeletedEntities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // Run once on mount - loadDeletedEntities is defined below

  const handleStartScheduler = () => {
    scheduler.start();
    loadData();
  };

  const handleStopScheduler = () => {
    scheduler.stop();
    loadData();
  };

  const handleRunArchiveCheck = async () => {
    setIsLoading(true);
    try {
      await scheduler.runArchiveCheck();
      await loadData();
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunCleanup = async (dryRun: boolean = true) => {
    setIsLoading(true);
    try {
      const cleanerInstance = getOrphanedRecordsCleaner({ dryRun });
      const report = await cleanerInstance.runCleanup();
      setLastCleanupReport(report);
      await loadData();
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = async () => {
    setIsLoading(true);
    try {
      // Get data from stores (simplified example)
      const data = {
        archives: archiveService.exportArchiveSummaries(),
        policies: policyManager.exportPolicies(),
      };
      
      const result = await exportService.exportData(data, {
        format: 'zip',
        includeMetadata: true,
        compress: true,
      });
      
      if (result.success) {
        logger.info('Data exported successfully', 'data-lifecycle');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load soft-deleted entities
  const loadDeletedEntities = useCallback(async () => {
    setIsLoadingDeleted(true);
    try {
      const [clubsResult, dogsResult] = await Promise.all([
        getDeletedClubs(),
        getDeletedDogs(),
      ]);
      
      if (clubsResult.error) {
        logger.error('Failed to load deleted clubs', 'data-lifecycle', {}, new Error(clubsResult.error.message));
      } else {
        setDeletedClubs(clubsResult.data as Array<{ id: string; name: string | null; deleted_at: string | null; deleted_by_user?: { email?: string } | null }>);
      }

      if (dogsResult.error) {
        logger.error('Failed to load deleted dogs', 'data-lifecycle', {}, new Error(dogsResult.error.message));
      } else {
        setDeletedDogs(dogsResult.data as Array<{ id: string; name: string; breed: string; deleted_at: string | null; deleted_by_user?: { email?: string } | null }>);
      }
    } catch (error) {
      logger.error('Failed to load deleted entities', 'data-lifecycle', {}, error as Error);
    } finally {
      setIsLoadingDeleted(false);
    }
  }, []);

  // Show restore confirmation
  const handleShowRestoreDialog = (entityId: string, entityName: string, entityType: 'club' | 'dog') => {
    setSelectedEntity({ id: entityId, name: entityName, type: entityType });
    setShowRestoreDialog(true);
  };

  // Restore a club or dog
  const handleConfirmRestore = async () => {
    if (!selectedEntity || !userWithRoles?.databaseUserId) {
      logger.error('No entity selected or user context available for restoration', 'data-lifecycle');
      return;
    }

    setIsLoadingDeleted(true);
    try {
      let result;
      if (selectedEntity.type === 'club') {
        result = await restoreClub(selectedEntity.id, userWithRoles.databaseUserId);
      } else {
        result = await restoreDog(selectedEntity.id, userWithRoles.databaseUserId);
      }
      
      if (result.error) {
        logger.error(`Failed to restore ${selectedEntity.type}`, 'data-lifecycle', { entityId: selectedEntity.id }, result.error);
      } else {
        logger.info(`${selectedEntity.type === 'club' ? 'Club' : 'Dog'} restored successfully`, 'data-lifecycle', { entityId: selectedEntity.id });
        await loadDeletedEntities(); // Refresh the list
      }
    } catch (error) {
      logger.error(`Exception while restoring ${selectedEntity.type}`, 'data-lifecycle', { entityId: selectedEntity.id }, error as Error);
    } finally {
      setIsLoadingDeleted(false);
      setSelectedEntity(null);
    }
  };

  // Show permanent delete confirmation
  const handleShowDeleteDialog = (entityId: string, entityName: string, entityType: 'club' | 'dog') => {
    setSelectedEntity({ id: entityId, name: entityName, type: entityType });
    setShowDeleteDialog(true);
  };

  // Permanently delete a club or dog
  const handleConfirmDelete = async () => {
    if (!selectedEntity) {
      logger.error('No entity selected for deletion', 'data-lifecycle');
      return;
    }

    setIsLoadingDeleted(true);
    try {
      let result;
      if (selectedEntity.type === 'club') {
        result = await hardDeleteClub(selectedEntity.id);
      } else {
        result = await hardDeleteDog(selectedEntity.id);
      }
      
      if (result.error) {
        logger.error(`Failed to permanently delete ${selectedEntity.type}`, 'data-lifecycle', { entityId: selectedEntity.id }, result.error);
      } else {
        logger.info(`${selectedEntity.type === 'club' ? 'Club' : 'Dog'} permanently deleted`, 'data-lifecycle', { entityId: selectedEntity.id });
        await loadDeletedEntities(); // Refresh the list
      }
    } catch (error) {
      logger.error(`Exception while permanently deleting ${selectedEntity.type}`, 'data-lifecycle', { entityId: selectedEntity.id }, error as Error);
    } finally {
      setIsLoadingDeleted(false);
      setSelectedEntity(null);
    }
  };


  return (
    <div className="min-h-screen pt-20 pb-8 px-6 max-w-[90rem] mx-auto">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data Lifecycle Management</h1>
          <p className="text-muted-foreground">
            Manage data archiving, retention policies, and cleanup operations
          </p>
        </div>
        <Button onClick={loadData} disabled={isLoading}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Archive className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Archived Shows</p>
              <p className="text-2xl font-bold">{archiveStats?.totalArchived || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <HardDrive className="h-8 w-8 text-green-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Storage Used</p>
              <p className="text-2xl font-bold">
                {archiveStats?.totalSizeMB ? `${archiveStats.totalSizeMB.toFixed(1)}MB` : '0MB'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Clock className="h-8 w-8 text-orange-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Scheduler Status</p>
              <p className="text-2xl font-bold">
                {schedulerStatus?.isRunning ? (
                  <Badge variant="default" className="bg-green-100 text-green-800">Running</Badge>
                ) : (
                  <Badge variant="secondary">Stopped</Badge>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Shield className="h-8 w-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Policies</p>
              <p className="text-2xl font-bold">{policyManager.exportPolicies().length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deleted Entities Overview Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Home className="h-8 w-8 text-orange-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Deleted Clubs</p>
              <p className="text-2xl font-bold">{deletedClubs.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardContent className="flex items-center p-6">
            <Users className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Deleted Dogs</p>
              <p className="text-2xl font-bold">{deletedDogs.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
          <TabsTrigger 
            value="overview" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger 
            value="archiving"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Archiving
          </TabsTrigger>
          <TabsTrigger 
            value="policies"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Policies
          </TabsTrigger>
          <TabsTrigger 
            value="cleanup"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Cleanup
          </TabsTrigger>
          <TabsTrigger 
            value="export"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Export/Import
          </TabsTrigger>
          <TabsTrigger 
            value="deleted"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Deleted Entities
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Archive Summary */}
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Archive className="h-5 w-5" />
                  Archive Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {archiveStats ? (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Archives:</span>
                      <span className="font-medium">{archiveStats.totalArchived}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Storage Used:</span>
                      <span className="font-medium">{archiveStats.totalSizeMB.toFixed(2)}MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Compression:</span>
                      <span className="font-medium">
                        {(archiveStats.compressionRatio * 100).toFixed(0)}%
                      </span>
                    </div>
                    {archiveStats.oldestArchive && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Oldest:</span>
                        <span className="font-medium text-sm">{archiveStats.oldestArchive}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Loading archive statistics...</p>
                )}
              </CardContent>
            </Card>

            {/* Scheduler Status */}
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Scheduler Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {schedulerStatus ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      {schedulerStatus.isRunning ? (
                        <Badge className="bg-green-100 text-green-800">
                          <Play className="h-3 w-3 mr-1" />
                          Running
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Pause className="h-3 w-3 mr-1" />
                          Stopped
                        </Badge>
                      )}
                    </div>
                    
                    {schedulerStatus.lastRunTime ? (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Last Run:</span>
                        <span className="font-medium text-sm">
                          {String(new Date(schedulerStatus.lastRunTime as string | number | Date).toLocaleString())}
                        </span>
                      </div>
                    ) : null}
                    
                    {schedulerStatus.nextRunTime ? (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Next Run:</span>
                        <span className="font-medium text-sm">
                          {String(new Date(schedulerStatus.nextRunTime as string | number | Date).toLocaleString())}
                        </span>
                      </div>
                    ) : null}
                    
                    <div className="flex gap-2 pt-2">
                      {schedulerStatus.isRunning ? (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="!border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                          onClick={handleStopScheduler}
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Stop
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          onClick={handleStartScheduler}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Start
                        </Button>
                      )}
                      
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="!border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                        onClick={handleRunArchiveCheck}
                        disabled={isLoading}
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Run Now
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Loading scheduler status...</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Archive scheduler started</span>
                  <span className="text-xs text-muted-foreground ml-auto">2 min ago</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg">
                  <Archive className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">3 shows archived automatically</span>
                  <span className="text-xs text-muted-foreground ml-auto">1 hour ago</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg">
                  <Trash2 className="h-4 w-4 text-orange-600" />
                  <span className="text-sm">Cleanup scan completed - 12 orphans found</span>
                  <span className="text-xs text-muted-foreground ml-auto">6 hours ago</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="archiving" className="space-y-6">
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <CardHeader>
              <CardTitle>Archive Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="!border-white/10 !bg-white/5">
                <Archive className="h-4 w-4" />
                <AlertDescription>
                  Shows are automatically archived 30 days after completion. 
                  Archived data is compressed and can be restored when needed.
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <h4 className="font-medium">Archive Settings</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>• Archive after: 30 days</p>
                    <p>• Compression: Enabled</p>
                    <p>• Max size: 100MB</p>
                    <p>• Retention: 365 days</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Quick Actions</h4>
                  <div className="space-y-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full justify-start !border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                      onClick={handleRunArchiveCheck}
                      disabled={isLoading}
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Run Archive Check
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full justify-start !border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Configure Settings
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Archive Statistics</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total:</span>
                      <span>{archiveStats?.totalArchived || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Size:</span>
                      <span>{archiveStats?.totalSizeMB.toFixed(1) || 0}MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Saved:</span>
                      <span className="text-green-600">
                        {archiveStats ? `${((1 - archiveStats.compressionRatio) * 100).toFixed(0)}%` : '0%'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-6">
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <CardHeader>
              <CardTitle>Retention Policies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {policyManager.exportPolicies().map(policy => (
                  <div key={policy.id} className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{policy.name}</h4>
                      <Badge variant={policy.isActive ? "default" : "secondary"}>
                        {policy.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {policy.description}
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Data Types: {policy.dataTypes.join(', ')}
                      </span>
                      <span className="text-muted-foreground">
                        Priority: {policy.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cleanup" className="space-y-6">
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <CardHeader>
              <CardTitle>Orphaned Records Cleanup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="!border-white/10 !bg-white/5">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Cleanup operations help maintain data integrity by removing orphaned records.
                  Always run in dry-run mode first to review what will be removed.
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <Button 
                  onClick={() => handleRunCleanup(true)}
                  disabled={isLoading}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Dry Run Scan
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => handleRunCleanup(false)}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Execute Cleanup
                </Button>
              </div>

              {lastCleanupReport && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">Last Cleanup Report</h4>
                  
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-600">
                        {lastCleanupReport.orphansFound}
                      </p>
                      <p className="text-sm text-muted-foreground">Orphans Found</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600">
                        {lastCleanupReport.orphansRemoved}
                      </p>
                      <p className="text-sm text-muted-foreground">Records Removed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {(lastCleanupReport.spaceReclaimed / 1024).toFixed(1)}KB
                      </p>
                      <p className="text-sm text-muted-foreground">Space Reclaimed</p>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p>Completed: {lastCleanupReport.scanCompleted.toLocaleString()}</p>
                    {lastCleanupReport.errors.length > 0 && (
                      <p className="text-red-600">Errors: {lastCleanupReport.errors.length}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Export Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Export your data for backup, analysis, or migration purposes.
                </p>
                
                <div className="space-y-2">
                  <Button 
                    className="w-full justify-start"
                    onClick={handleExportData}
                    disabled={isLoading}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export All Data (ZIP)
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start !border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                    disabled={isLoading}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Export Archives Only (JSON)
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start !border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                    disabled={isLoading}
                  >
                    <Database className="h-4 w-4 mr-2" />
                    Export Policies (CSV)
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Import Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Import previously exported data or restore from backup.
                </p>
                
                <Alert className="!border-white/10 !bg-white/5">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    Always run imports in dry-run mode first to validate the data.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start !border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File to Import
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="deleted" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Deleted Clubs */}
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="h-5 w-5 text-orange-600" />
                  Deleted Clubs ({deletedClubs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {isLoadingDeleted ? (
                    <p className="text-muted-foreground">Loading deleted clubs...</p>
                  ) : deletedClubs.length === 0 ? (
                    <p className="text-muted-foreground">No deleted clubs found.</p>
                  ) : (
                    deletedClubs.map((club) => (
                      <div key={club.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{club.name || 'Unnamed Club'}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Deleted: {club.deleted_at ? new Date(club.deleted_at).toLocaleDateString() : 'Unknown'}</span>
                            {club.deleted_by_user && (
                              <span>by {club.deleted_by_user.email || 'Unknown'}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="!border-green-200/20 !bg-green-50/10 hover:!bg-green-50/20 !text-green-700 hover:!text-green-800"
                            onClick={() => handleShowRestoreDialog(club.id, club.name || 'Unnamed Club', 'club')}
                            disabled={isLoadingDeleted}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="!border-red-200/20 !bg-red-50/10 hover:!bg-red-50/20 !text-red-700 hover:!text-red-800"
                            onClick={() => handleShowDeleteDialog(club.id, club.name || 'Unnamed Club', 'club')}
                            disabled={isLoadingDeleted}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {deletedClubs.length > 0 && (
                  <div className="mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-border/20 bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      onClick={loadDeletedEntities}
                      disabled={isLoadingDeleted}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh List
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Deleted Dogs */}
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  Deleted Dogs ({deletedDogs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {isLoadingDeleted ? (
                    <p className="text-muted-foreground">Loading deleted dogs...</p>
                  ) : deletedDogs.length === 0 ? (
                    <p className="text-muted-foreground">No deleted dogs found.</p>
                  ) : (
                    deletedDogs.map((dog) => (
                      <div key={dog.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{dog.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{dog.breed}</span>
                            <span>•</span>
                            <span>Deleted: {dog.deleted_at ? new Date(dog.deleted_at).toLocaleDateString() : 'Unknown'}</span>
                            {dog.deleted_by_user && (
                              <>
                                <span>by</span>
                                <span>{dog.deleted_by_user.email || 'Unknown'}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="!border-green-200/20 !bg-green-50/10 hover:!bg-green-50/20 !text-green-700 hover:!text-green-800"
                            onClick={() => handleShowRestoreDialog(dog.id, dog.name, 'dog')}
                            disabled={isLoadingDeleted}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="!border-red-200/20 !bg-red-50/10 hover:!bg-red-50/20 !text-red-700 hover:!text-red-800"
                            onClick={() => handleShowDeleteDialog(dog.id, dog.name, 'dog')}
                            disabled={isLoadingDeleted}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {deletedDogs.length > 0 && (
                  <div className="mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-border/20 bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      onClick={loadDeletedEntities}
                      disabled={isLoadingDeleted}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh List
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Admin Information */}
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-600" />
                Soft Delete Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="!border-amber-200/20 !bg-amber-50/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Restore:</strong> Restores a soft-deleted entity back to active status. The entity will reappear in normal lists and can be used again.
                  <br /><br />
                  <strong>Delete:</strong> Permanently removes the entity from the database. This action cannot be undone and all related data will be lost.
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Safety Features</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Audit trail tracks who deleted each item</li>
                    <li>• Deletion timestamps are preserved</li>
                    <li>• Permanent deletion requires confirmation</li>
                    <li>• Related data is handled appropriately</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Quick Stats</h4>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Deleted Clubs:</span>
                      <span className="text-orange-600">{deletedClubs.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Deleted Dogs:</span>
                      <span className="text-blue-600">{deletedDogs.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Items:</span>
                      <span className="font-medium">{deletedClubs.length + deletedDogs.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isLoading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <Card className="p-6 border border-border rounded-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
              <span>Processing...</span>
            </div>
          </Card>
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {selectedEntity?.type === 'club' ? 'Club' : 'Dog'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore "{selectedEntity?.name}"? This will make it visible and active again in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRestore}
              disabled={isLoadingDeleted}
              className="bg-green-500 hover:bg-green-600"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete {selectedEntity?.type === 'club' ? 'Club' : 'Dog'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete "{selectedEntity?.name}"? This action cannot be undone and will remove all data associated with this {selectedEntity?.type} from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isLoadingDeleted}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}