/**
 * Data Lifecycle Management Dashboard
 *
 * Admin interface for managing data archiving, retention policies,
 * orphaned record cleanup, and data export/import operations.
 *
 * This is the main shell component that orchestrates tabs and delegates
 * rendering to focused sub-components.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RotateCcw } from 'lucide-react';

import { getArchiveService, type ArchiveStats } from '@/services/data-lifecycle/DataArchiveService';
import { getArchiveScheduler } from '@/services/data-lifecycle/ArchiveScheduler';
import { getRetentionPolicyManager } from '@/services/data-lifecycle/DataRetentionPolicy';
import { getOrphanedRecordsCleaner, type CleanupReport } from '@/services/data-lifecycle/OrphanedRecordsCleaner';
import { getDataExportImportService } from '@/services/data-lifecycle/DataExportImport';

import { getDeletedClubs, restoreClub, hardDeleteClub } from '@/services/database/queries/clubQueries';
import { getDeletedDogs, restoreDog, hardDeleteDog } from '@/services/database/queries/dogQueries';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';

import type { DeletedClub, DeletedDog, SelectedEntity } from './types';
import { OverviewCards } from './OverviewCards';
import { OverviewTab } from './OverviewTab';
import { ArchivingTab } from './ArchivingTab';
import { PoliciesTab } from './PoliciesTab';
import { CleanupTab } from './CleanupTab';
import { ExportImportTab } from './ExportImportTab';
import { DeletedEntitiesTab } from './DeletedEntitiesTab';
import { ConfirmationDialogs } from './ConfirmationDialogs';

const TAB_TRIGGER_CLASS =
  'data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300';

export function DataLifecycleManagement() {
  const [archiveStats, setArchiveStats] = useState<ArchiveStats | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<Record<string, unknown> | null>(null);
  const [lastCleanupReport, setLastCleanupReport] = useState<CleanupReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Soft delete management state
  const [deletedClubs, setDeletedClubs] = useState<DeletedClub[]>([]);
  const [deletedDogs, setDeletedDogs] = useState<DeletedDog[]>([]);
  const [isLoadingDeleted, setIsLoadingDeleted] = useState(false);
  const { userWithRoles } = useAuthContext();

  // Confirmation dialog state
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);

  const archiveService = getArchiveService();
  const scheduler = getArchiveScheduler();
  const policyManager = getRetentionPolicyManager();
  const exportService = getDataExportImportService();

  // ---- Data loading ----

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
        setDeletedClubs(clubsResult.data as DeletedClub[]);
      }

      if (dogsResult.error) {
        logger.error('Failed to load deleted dogs', 'data-lifecycle', {}, new Error(dogsResult.error.message));
      } else {
        setDeletedDogs(dogsResult.data as DeletedDog[]);
      }
    } catch (error) {
      logger.error('Failed to load deleted entities', 'data-lifecycle', {}, error as Error);
    } finally {
      setIsLoadingDeleted(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadDeletedEntities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // ---- Scheduler handlers ----

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

  // ---- Cleanup handler ----

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

  // ---- Export handler ----

  const handleExportData = async () => {
    setIsLoading(true);
    try {
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

  // ---- Soft-delete restore/delete handlers ----

  const handleShowRestoreDialog = (entityId: string, entityName: string, entityType: 'club' | 'dog') => {
    setSelectedEntity({ id: entityId, name: entityName, type: entityType });
    setShowRestoreDialog(true);
  };

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
        await loadDeletedEntities();
      }
    } catch (error) {
      logger.error(`Exception while restoring ${selectedEntity.type}`, 'data-lifecycle', { entityId: selectedEntity.id }, error as Error);
    } finally {
      setIsLoadingDeleted(false);
      setSelectedEntity(null);
    }
  };

  const handleShowDeleteDialog = (entityId: string, entityName: string, entityType: 'club' | 'dog') => {
    setSelectedEntity({ id: entityId, name: entityName, type: entityType });
    setShowDeleteDialog(true);
  };

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
        await loadDeletedEntities();
      }
    } catch (error) {
      logger.error(`Exception while permanently deleting ${selectedEntity.type}`, 'data-lifecycle', { entityId: selectedEntity.id }, error as Error);
    } finally {
      setIsLoadingDeleted(false);
      setSelectedEntity(null);
    }
  };

  // ---- Render ----

  const policies = policyManager.exportPolicies();

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
        <OverviewCards
          archiveStats={archiveStats}
          schedulerStatus={schedulerStatus}
          policyCount={policies.length}
          deletedClubsCount={deletedClubs.length}
          deletedDogsCount={deletedDogs.length}
        />

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
            <TabsTrigger value="overview" className={TAB_TRIGGER_CLASS}>
              Overview
            </TabsTrigger>
            <TabsTrigger value="archiving" className={TAB_TRIGGER_CLASS}>
              Archiving
            </TabsTrigger>
            <TabsTrigger value="policies" className={TAB_TRIGGER_CLASS}>
              Policies
            </TabsTrigger>
            <TabsTrigger value="cleanup" className={TAB_TRIGGER_CLASS}>
              Cleanup
            </TabsTrigger>
            <TabsTrigger value="export" className={TAB_TRIGGER_CLASS}>
              Export/Import
            </TabsTrigger>
            <TabsTrigger value="deleted" className={TAB_TRIGGER_CLASS}>
              Deleted Entities
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              archiveStats={archiveStats}
              schedulerStatus={schedulerStatus}
              isLoading={isLoading}
              onStartScheduler={handleStartScheduler}
              onStopScheduler={handleStopScheduler}
              onRunArchiveCheck={handleRunArchiveCheck}
            />
          </TabsContent>

          <TabsContent value="archiving">
            <ArchivingTab
              archiveStats={archiveStats}
              isLoading={isLoading}
              onRunArchiveCheck={handleRunArchiveCheck}
            />
          </TabsContent>

          <TabsContent value="policies">
            <PoliciesTab policies={policies} />
          </TabsContent>

          <TabsContent value="cleanup">
            <CleanupTab
              isLoading={isLoading}
              lastCleanupReport={lastCleanupReport}
              onRunCleanup={handleRunCleanup}
            />
          </TabsContent>

          <TabsContent value="export">
            <ExportImportTab
              isLoading={isLoading}
              onExportData={handleExportData}
            />
          </TabsContent>

          <TabsContent value="deleted">
            <DeletedEntitiesTab
              deletedClubs={deletedClubs}
              deletedDogs={deletedDogs}
              isLoadingDeleted={isLoadingDeleted}
              onShowRestoreDialog={handleShowRestoreDialog}
              onShowDeleteDialog={handleShowDeleteDialog}
              onRefreshDeletedEntities={loadDeletedEntities}
            />
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

        <ConfirmationDialogs
          showRestoreDialog={showRestoreDialog}
          onRestoreDialogChange={setShowRestoreDialog}
          showDeleteDialog={showDeleteDialog}
          onDeleteDialogChange={setShowDeleteDialog}
          selectedEntity={selectedEntity}
          isLoadingDeleted={isLoadingDeleted}
          onConfirmRestore={handleConfirmRestore}
          onConfirmDelete={handleConfirmDelete}
        />
      </div>
    </div>
  );
}
