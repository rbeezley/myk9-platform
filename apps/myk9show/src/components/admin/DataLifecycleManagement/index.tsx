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
import {
  getOrphanedRecordsCleaner,
  type CleanupReport,
} from '@/services/data-lifecycle/OrphanedRecordsCleaner';
import { getDataExportImportService } from '@/services/data-lifecycle/DataExportImport';

import { logger } from '@/services/LoggingService';

import { OverviewCards } from './OverviewCards';
import { OverviewTab } from './OverviewTab';
import { ArchivingTab } from './ArchivingTab';
import { PoliciesTab } from './PoliciesTab';
import { CleanupTab } from './CleanupTab';
import { ExportImportTab } from './ExportImportTab';
import { DeletedEntitiesTab } from './DeletedEntitiesTab';

const TAB_TRIGGER_CLASS =
  'data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300';

export function DataLifecycleManagement() {
  const [archiveStats, setArchiveStats] = useState<ArchiveStats | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<Record<string, unknown> | null>(null);
  const [lastCleanupReport, setLastCleanupReport] = useState<CleanupReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

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

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // ---- Render ----

  const policies = policyManager.exportPolicies();

  return (
    <div className="min-h-screen pt-8 pb-8 px-6 max-w-[90rem] mx-auto">
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
            <ExportImportTab isLoading={isLoading} onExportData={handleExportData} />
          </TabsContent>

          <TabsContent value="deleted">
            <DeletedEntitiesTab />
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

      </div>
    </div>
  );
}
