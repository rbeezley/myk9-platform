/**
 * Secretary Class Dashboard Component
 *
 * Main dashboard for secretaries to manage class results, including:
 * - Class overview and entry statistics
 * - Results grid with inline editing
 * - Bulk operations and placement calculation
 * - CSV export and result management
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useClassScentWorkEntries } from '@/hooks/queries/useClassScentWorkEntries';
import {
  Clock,
  Users,
  Award,
  FileText,
  Download,
  Calculator,
  ArrowLeft,
  Play,
  Check,
} from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import { useParams, useNavigate } from 'react-router-dom';
import { useUrlTab } from '@/hooks/useUrlTab';
import { logger } from '@/services/LoggingService';

// Add imports for the same data stores ClassDetailsPage uses
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useTrialStore } from '@/store/trialStore';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useEntriesByClass } from '@/hooks/useFilteredEntries';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import Breadcrumb from '@/components/common/Breadcrumb';
import type { ShowEntry } from '@/types/entry-lifecycle';
import type { CompetitionData } from '@/store/entryStore';

// UI Components
import { Button } from '@/components/ui/button';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { Separator } from '@/components/ui/separator/separator';

// Custom components
import { BulkResultEntry } from './BulkResultEntry';
import { deriveSportType } from '@/pages/scoring/types';
import { PlacementCalculator } from './PlacementCalculator';
import { SettingsOverrideCard } from './SettingsOverrideCard';

// Settings hooks
import { useClassEffectiveSettings } from '@/hooks/queries/useShowSettingsDatabase';

// Utilities
import { msToDisplay } from '@/lib/timeUtils';

// Premium styling
import '@/styles/myk9-show-details.css';

// Types
import type {
  ScentWorkEntry,
  ScentWorkResult,
  MultiAreaScentWorkResult,
  ScentWorkClassConfig,
} from '@/types/scent-work-types';

export interface SecretaryClassDashboardProps {
  classId?: string; // Now optional, will use URL params if not provided
  classConfig?: ScentWorkClassConfig;
  classInfo?: {
    name: string;
    judgeAssignment: string;
    scheduledTime: Date;
    ring: string;
    status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  };
  entries?: ScentWorkEntry[];
  results?: Map<string, ScentWorkResult | MultiAreaScentWorkResult>;
  onCalculatePlacements?: () => Promise<void>;
  onExportResults?: (format: 'csv' | 'pdf') => Promise<void>;
}

/**
 * Secretary dashboard for managing class results and operations
 */
export function SecretaryClassDashboard({
  classId: propClassId,
  classConfig: propClassConfig,
  classInfo: propClassInfo,
  entries: propEntries,
  results: propResults,
  onCalculatePlacements,
  onExportResults,
}: SecretaryClassDashboardProps) {
  // Get route parameters
  const navigate = useNavigate();
  const { showId, trialId, classId: urlClassId } = useParams();

  // Use URL classId if available, otherwise fall back to prop
  const activeClassId = urlClassId || propClassId;

  // Connect to the same data stores as ClassDetailsPage
  const { classes } = useClassStoreCompat();
  const { updateResult } = useEntryStore();
  const { shows } = useShowStore();
  const { trials } = useTrialStore();
  const { user } = useAuthContext();

  // Get current class, trial, and show data
  const currentClass = activeClassId ? classes.find(cls => cls.id === activeClassId) : null;
  const currentTrial = trialId ? trials.find(trial => trial.id === trialId) : null;
  const currentShow = showId ? shows.find(show => show.id === showId) : null;

  // Detect sport type — used to show the right bulk entry UI
  const isScentWorkClass = useMemo(() => {
    const sportTypeCode =
      currentShow?.organization && currentTrial?.trialType
        ? (deriveSportType(currentShow.organization, currentTrial.trialType) ?? 'unknown')
        : 'unknown';
    return [
      'akc-scent-work',
      'akc-scent-work-nationals',
      'ukc-nosework',
      'asca-scent-detection',
    ].includes(sportTypeCode);
  }, [currentShow?.organization, currentTrial?.trialType]);

  // Effective visibility + check-in settings for this class (full cascade)
  const { data: classSettings, isLoading: classSettingsLoading } = useClassEffectiveSettings(
    activeClassId ?? null,
    trialId ?? null,
    showId ?? null
  );

  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'class',
    show: currentShow || undefined,
    trial: currentTrial || undefined,
    classId: activeClassId || undefined,
  });

  const [activeTab, setActiveTab] = useUrlTab(['overview', 'bulk', 'placements'], 'overview');
  const [isCalculatingPlacements, setIsCalculatingPlacements] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Mock data when not provided via props - wrapped in useMemo
  const classConfig = useMemo(
    () =>
      propClassConfig || {
        element: 'Interior' as const,
        level: 'Novice' as const,
        timeLimit: 180000,
        multiArea: false,
        warningsEnabled: true,
      },
    [propClassConfig]
  );

  // Entry sources + merge + transform — owned by useClassScentWorkEntries.
  // Local entries come first; DB-only entries are appended. rawEntries (the
  // local-only ShowEntry list) is still needed by handleResultUpdate below.
  const rawEntries = useEntriesByClass(activeClassId || '');
  const {
    entries: actualEntries,
    dbCount,
    localCount,
  } = useClassScentWorkEntries(activeClassId, classConfig);

  // Debug: Log entry counts when sources change
  useEffect(() => {
    logger.debug('SecretaryClassDashboard entry sources', 'secretary', {
      dbCount,
      localCount,
    });
  }, [dbCount, localCount]);

  const classInfo = propClassInfo || {
    name: currentClass
      ? `${currentClass.element} ${currentClass.level} ${currentClass.section}`
      : 'Interior Novice A',
    judgeAssignment: currentClass?.judge || 'Jane Doe',
    scheduledTime: currentClass?.startTime ? new Date(currentClass.startTime) : new Date(),
    ring: 'Ring 1',
    status: (currentClass?.status?.toLowerCase() === 'in progress' ? 'in-progress' : 'pending') as
      | 'in-progress'
      | 'pending',
  };

  // Use actual entries from the store, fallback to props if provided
  const entries = useMemo(() => propEntries || actualEntries, [propEntries, actualEntries]);
  const results = useMemo(() => propResults || new Map(), [propResults]);

  // Navigation handlers
  const handleExit = useCallback(() => {
    if (showId && trialId && activeClassId) {
      navigate(`/shows/${showId}/trials/${trialId}/classes/${activeClassId}`);
    }
  }, [navigate, showId, trialId, activeClassId]);

  // Result update handler - saves results to entry store
  const handleResultUpdate = useCallback(
    async (entryId: string, result: ScentWorkResult | MultiAreaScentWorkResult) => {
      try {
        // Find the entry to update
        const entryToUpdate = rawEntries.find(
          entry => (entry as ShowEntry).id === entryId
        ) as ShowEntry;
        if (!entryToUpdate) {
          logger.error('Entry not found', 'secretary', { entryId });
          return;
        }

        // Save to store using updateResult method
        const searchTime = 'searchTime' in result ? result.searchTime : result.totalSearchTime;
        const competitionData: CompetitionData = {
          score: searchTime ? (searchTime / 1000).toString() : '',
          time: searchTime ? msToDisplay(searchTime, 'hundredths') : '',
          qualified: result.qualification === 'Qualified',
          qualification: result.qualification, // Save the specific qualification status
          faults: ('faults' in result ? result.faults : result.totalFaults) || 0,
          placement:
            (
              result as ScentWorkResult & { placementCalculated?: number }
            ).placementCalculated?.toString() || '',
          judgeNotes: result.judgeNotes || '',
          recordedBy: 'Secretary',
          recordedAt: new Date().toISOString(),
        };

        logger.debug('Saving result for entry', 'secretary', {
          entryId,
          time: competitionData.time,
          qualified: competitionData.qualified,
          qualification: competitionData.qualification,
          faults: competitionData.faults,
          notes: competitionData.judgeNotes,
        });
        await updateResult(entryId, competitionData, user?.id || 'unknown');
      } catch (error) {
        logger.error('Error saving result', 'secretary', { entryId }, error as Error);
      }
    },
    [rawEntries, updateResult, user]
  );

  const stats = useMemo(() => {
    const totalEntries = entries.length;
    let qualifiedCount = 0;
    let nqCount = 0;
    let absentCount = 0;

    for (const result of results.values()) {
      if (result.qualification === 'Qualified') qualifiedCount++;
      else if (result.qualification === 'Not Qualified') nqCount++;
      else if (result.qualification === 'Absent') absentCount++;
    }

    const completedResults = results.size;
    const pendingResults = totalEntries - completedResults;
    const completionPercentage =
      totalEntries > 0 ? Math.round((completedResults / totalEntries) * 100) : 0;

    return {
      totalEntries,
      completedResults,
      pendingResults,
      qualifiedCount,
      nqCount,
      absentCount,
      completionPercentage,
    };
  }, [entries, results]);

  // Handle placement calculation
  const handleCalculatePlacements = useCallback(async () => {
    setIsCalculatingPlacements(true);
    try {
      if (onCalculatePlacements) {
        await onCalculatePlacements();
      } else {
        // Default behavior: log action
        logger.debug('Calculate placements requested', 'secretary');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error('Failed to calculate placements', 'secretary', {}, error as Error);
    } finally {
      setIsCalculatingPlacements(false);
    }
  }, [onCalculatePlacements]);

  // Handle CSV export
  const handleExport = useCallback(
    async (format: 'csv' | 'pdf') => {
      setIsExporting(true);
      try {
        if (onExportResults) {
          await onExportResults(format);
        } else {
          // Default behavior: log action
          logger.debug('Export results requested', 'secretary', { format });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        logger.error('Failed to export results', 'secretary', { format }, error as Error);
      } finally {
        setIsExporting(false);
      }
    },
    [onExportResults]
  );

  // Premium status helpers
  const getStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return 'myk9-show-status-upcoming';
      case 'in-progress':
      case 'in progress':
        return 'myk9-show-status-in-progress';
      case 'completed':
        return 'myk9-show-status-completed';
      default:
        return 'myk9-show-status-upcoming';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return <Clock className="w-3 h-3" />;
      case 'in-progress':
      case 'in progress':
        return <Play className="w-3 h-3" />;
      case 'completed':
        return <Check className="w-3 h-3" />;
      default:
        return <Clock className="w-3 h-3" />;
    }
  };

  return (
    <div className="myk9-show-container">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />

      {/* Header */}
      <div className="myk9-show-info-card">
        <div className="myk9-show-info-header">
          <div className="flex items-center gap-4">
            {showId && trialId && activeClassId && (
              <Button variant="ghost" size="sm" onClick={handleExit} className="myk9-action-button">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <div className="flex items-center gap-3">
                <div className="myk9-show-info-title">{classInfo.name}</div>
                <div className={`myk9-show-status ${getStatusClass(classInfo.status)}`}>
                  {getStatusIcon(classInfo.status)}
                  {classInfo.status}
                </div>
              </div>
              <p className="text-sm font-medium text-muted-foreground mt-2">
                {classConfig.element} {classConfig.level} • Ring {classInfo.ring} • Judge:{' '}
                {classInfo.judgeAssignment}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <StatsGrid columns={4}>
        <StatCard
          icon={Users}
          title="Total Entries"
          value={stats.totalEntries}
          color="primary"
          subtitle="Registered"
          progress={100}
        />
        <StatCard
          icon={Clock}
          title="Pending Results"
          value={stats.pendingResults}
          color="amber"
          subtitle="Awaiting entry"
          progress={
            stats.totalEntries > 0
              ? Math.round((stats.pendingResults / stats.totalEntries) * 100)
              : 0
          }
        />
        <StatCard
          icon={Award}
          title="Qualified"
          value={stats.qualifiedCount}
          color="emerald"
          subtitle={`Q: ${stats.qualifiedCount} / NQ: ${stats.nqCount}`}
          progress={
            stats.totalEntries > 0
              ? Math.round((stats.qualifiedCount / stats.totalEntries) * 100)
              : 0
          }
        />
        <StatCard
          icon={FileText}
          title="Complete"
          value={`${stats.completionPercentage}%`}
          color="blue"
          subtitle={`Done: ${stats.completedResults} / Total: ${stats.totalEntries}`}
          progress={stats.completionPercentage}
        />
      </StatsGrid>

      {/* Action Bar */}
      <div className="myk9-show-info-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleCalculatePlacements}
              disabled={isCalculatingPlacements || stats.completedResults === 0}
              className="myk9-action-button myk9-action-button-primary"
            >
              <Calculator className="h-4 w-4" />
              <span>{isCalculatingPlacements ? 'Calculating...' : 'Calculate Placements'}</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => handleExport('csv')}
              disabled={isExporting || stats.completedResults === 0}
              className="myk9-action-button"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Last updated: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* Tabbed Interface */}
      <div className="myk9-trials-section">
        <PrimaryTabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'bulk', label: 'Results Entry', count: entries.length },
            { id: 'placements', label: 'Placements' },
          ] satisfies PrimaryTabDef[]}
          value={activeTab}
          onValueChange={setActiveTab}
        >

          <TabsContent value="overview" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Visibility Settings Override */}
              {classSettings && activeClassId && trialId && showId && (
                <div className="lg:col-span-2">
                  <SettingsOverrideCard
                    level="class"
                    entityId={activeClassId}
                    showId={showId}
                    trialId={trialId}
                    currentSettings={classSettings.visibility}
                    selfCheckinEnabled={classSettings.selfCheckinEnabled}
                    isLoading={classSettingsLoading}
                  />
                </div>
              )}

              {/* Class Information */}
              <div className="myk9-show-info-card">
                <div className="myk9-show-info-header">
                  <div className="myk9-show-info-title">Class Details</div>
                </div>
                <div className="myk9-show-info-grid">
                  <div className="myk9-show-info-item">
                    <div className="myk9-show-info-label">Element</div>
                    <div className="myk9-show-info-value">{classConfig.element}</div>
                  </div>
                  <div className="myk9-show-info-item">
                    <div className="myk9-show-info-label">Level</div>
                    <div className="myk9-show-info-value">{classConfig.level}</div>
                  </div>
                  <div className="myk9-show-info-item">
                    <div className="myk9-show-info-label">Time Limit</div>
                    <div className="myk9-show-info-value">
                      {Math.floor(classConfig.timeLimit / 60000)}:00
                    </div>
                  </div>
                  <div className="myk9-show-info-item">
                    <div className="myk9-show-info-label">Multi-Area</div>
                    <div className="myk9-show-info-value">
                      {classConfig.multiArea ? 'Yes' : 'No'}
                    </div>
                  </div>
                  <div className="myk9-show-info-item">
                    <div className="myk9-show-info-label">Scheduled</div>
                    <div className="myk9-show-info-value">
                      {classInfo.scheduledTime.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress Summary */}
              <div className="myk9-show-info-card">
                <div className="myk9-show-info-header">
                  <div className="myk9-show-info-title">Progress Summary</div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Completion Progress</span>
                      <span className="font-medium">{stats.completionPercentage}%</span>
                    </div>
                    <div className="h-[3px] overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${stats.completionPercentage}%` }}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-teal-600 font-medium">Qualified:</span>
                      <div className="px-3 py-1 bg-teal-100 text-teal-800 rounded-full text-sm font-medium dark:bg-teal-900 dark:text-teal-200">
                        {stats.qualifiedCount}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-red-600 font-medium">Not Qualified:</span>
                      <div className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium dark:bg-red-900 dark:text-red-200">
                        {stats.nqCount}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-medium">Absent:</span>
                      <div className="px-3 py-1 bg-muted text-muted-foreground rounded-full text-sm font-medium">
                        {stats.absentCount}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bulk" className="mt-0">
            {isScentWorkClass ? (
              <BulkResultEntry
                classId={activeClassId ?? ''}
                entries={entries as ScentWorkEntry[]}
                classConfig={classConfig}
                onResultsSubmit={async bulkResults => {
                  for (const result of bulkResults) {
                    await handleResultUpdate(result.entryId, result);
                  }
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <FileText className="h-10 w-10 text-muted-foreground opacity-50" />
                <div>
                  <p className="font-medium text-foreground mb-1">
                    Batch paper entry is not yet available for this sport type.
                  </p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Use the individual entry flow to score each dog from paper scoresheets.
                  </p>
                </div>
                {activeClassId && (
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/scoring/classes/${activeClassId}/entries`)}
                  >
                    Open Entry List
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="placements" className="mt-0">
            <PlacementCalculator
              entries={entries as ScentWorkEntry[]}
              results={results}
              classConfig={classConfig}
              onRecalculate={handleCalculatePlacements}
              isCalculating={isCalculatingPlacements}
            />
          </TabsContent>
        </PrimaryTabs>
      </div>
    </div>
  );
}
