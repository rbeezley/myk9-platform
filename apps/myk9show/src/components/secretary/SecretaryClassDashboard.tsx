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
import { useParams, useNavigate } from 'react-router-dom';
import { logger } from '@/services/LoggingService';

// Add imports for the same data stores ClassDetailsPage uses
import { useClassStoreCompat, useClassEntriesWithQuery } from '@/hooks/useClassStoreCompat';
import { useTrialStore } from '@/store/trialStore';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useDogStore } from '@/store/dogStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useEntriesByClass } from '@/hooks/useFilteredEntries';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import Breadcrumb from '@/components/common/Breadcrumb';
import type { ShowEntry } from '@/types/entry-lifecycle';
import type { CompetitionData } from '@/store/entryStore';

// UI Components
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator/separator';

// Custom components
import { BulkResultEntry } from './BulkResultEntry';
import { PlacementCalculator } from './PlacementCalculator';

// Premium styling
import '@/styles/myk9-show-details.css';

// Types
import type {
  ScentWorkEntry,
  ScentWorkResult,
  MultiAreaScentWorkResult,
  ScentWorkClassConfig,
  QualificationStatus,
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
  const { dogs } = useDogStore();
  const dogsById = useMemo(() => new Map(dogs.map(d => [d.id, d])), [dogs]);
  const { updateResult } = useEntryStore();
  const { shows } = useShowStore();
  const { trials } = useTrialStore();
  const { user } = useAuthContext();

  // Get current class, trial, and show data
  const currentClass = activeClassId ? classes.find(cls => cls.id === activeClassId) : null;
  const currentTrial = trialId ? trials.find(trial => trial.id === trialId) : null;
  const currentShow = showId ? shows.find(show => show.id === showId) : null;

  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'class',
    show: currentShow || undefined,
    trial: currentTrial || undefined,
    classId: activeClassId || undefined,
  });

  // --- Entry sources ---
  // 1. Database entries via React Query (primary source)
  const { entries: dbEntries } = useClassEntriesWithQuery(activeClassId || '', !!activeClassId);

  // 2. Local-only entries from the Zustand entry store (may include entries not yet synced)
  const localEntries = useEntriesByClass(activeClassId || '');

  // Merge: local entries are used as-is (they have full ShowEntry data);
  // local-only entries not yet in DB are included automatically.
  // The rawEntries is just localEntries — dedup with DB happens in actualEntries.
  const rawEntries = localEntries;

  // Debug: Log entry counts when sources change
  useEffect(() => {
    logger.debug('SecretaryClassDashboard entry sources', 'secretary', {
      dbCount: dbEntries.length,
      localCount: localEntries.length,
    });
  }, [dbEntries.length, localEntries.length]);

  const [activeTab, setActiveTab] = useState('overview');
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

  // Helper: transform a local ShowEntry into ScentWorkEntry shape
  const toScentWorkEntry = useCallback(
    (typedEntry: ShowEntry) => {
      const dog = dogsById.get(typedEntry.dogId);
      const registrationData = (typedEntry.registrationData || {}) as Record<string, unknown>;
      const competitionData = typedEntry.competitionData || ({} as CompetitionData);

      return {
        ...typedEntry,
        classConfig: classConfig,
        displayInfo: {
          armband: registrationData.armband || '',
          dogName: dog?.callName || dog?.name || 'Unknown Dog',
          dogBreed: dog?.registrations?.[0]?.breed || 'Unknown Breed',
          handlerName: registrationData.handler || 'Unknown Handler',
          dogId: typedEntry.dogId || '',
          handlerId: registrationData.handlerId || '',
        },
        judgingState: {
          isInProgress: false,
          currentResult:
            competitionData.score || competitionData.time
              ? {
                  entryId: typedEntry.id,
                  classId: activeClassId || '',
                  searchTime: competitionData.score ? parseFloat(competitionData.score) * 1000 : 0,
                  maxTimeAllowed: classConfig.timeLimit,
                  qualification: (competitionData.qualified === true
                    ? 'Qualified'
                    : competitionData.qualified === false
                      ? 'Not Qualified'
                      : 'Not Qualified') as QualificationStatus,
                  faults: 0,
                  judgeNotes: competitionData.judgeNotes || '',
                  recordedBy: competitionData.recordedBy || 'System',
                  recordedAt: new Date(
                    (competitionData as CompetitionData).recordedAt || Date.now()
                  ),
                }
              : undefined,
        },
      };
    },
    [dogsById, classConfig, activeClassId]
  );

  // Transform entries to the format expected by this component (ScentWorkEntry).
  // Merge: local entries first (transformed from ShowEntry), then DB-only entries
  // that aren't in the local store yet (transformed from DB display format).
  const actualEntries = useMemo(() => {
    // Transform local entries
    const localScentWork = rawEntries.map(entry => toScentWorkEntry(entry as ShowEntry));
    const localIds = new Set(rawEntries.map(e => (e as ShowEntry).id));

    // Add DB-only entries not present locally
    const dbOnlyEntries = dbEntries
      .filter(e => !localIds.has(e.id))
      .map(e => ({
        id: e.id,
        classId: e.classId || activeClassId || '',
        dogId: '',
        showId: '',
        status: 'submitted' as const,
        statusHistory: [],
        createdAt: '',
        updatedAt: '',
        registrationData: {
          submittedAt: '',
          handler: e.handler || '',
          entryFee: 0,
          paymentStatus: 'pending' as const,
        },
        competitionData: {
          score: e.score || '',
          time: e.time || '',
          qualified: e.status === 'Qualified',
          placement: e.placement || '',
          recordedAt: '',
          recordedBy: 'System',
        },
        classConfig: classConfig,
        displayInfo: {
          armband: e.armband || '',
          dogName: e.dog || 'Unknown Dog',
          dogBreed: 'Unknown Breed',
          handlerName: e.handler || 'Unknown Handler',
          dogId: '',
          handlerId: '',
        },
        judgingState: {
          isInProgress: false,
          currentResult: undefined,
        },
      }));

    return [...localScentWork, ...dbOnlyEntries];
  }, [rawEntries, dbEntries, toScentWorkEntry, classConfig, activeClassId]);

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
          time: searchTime ? formatTime(searchTime) : '',
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

  // Helper function to format time from milliseconds to MM:SS.HH format
  const formatTime = (ms: number): string => {
    // Use precise calculation to avoid rounding errors
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const hundredths = Math.round((totalSeconds % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  };

  // Calculate statistics in a single pass
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
      <div className="myk9-show-stats-section">
        <div className="myk9-show-stats-grid">
          <div className="myk9-show-stat-card">
            <div className="myk9-show-stat-layout">
              <div className="myk9-show-stat-icon entries">
                <Users className="w-5 h-5" />
              </div>
              <div className="myk9-show-stat-content">
                <div className="myk9-show-stat-header">
                  <div className="myk9-show-stat-title">Total Entries</div>
                </div>
                <div className="myk9-show-stat-number">{stats.totalEntries}</div>
              </div>
            </div>
            <div className="myk9-show-stat-details">
              <span>Registered</span>
              <span>Active</span>
            </div>
            <div className="myk9-show-stat-progress">
              <div className="myk9-show-stat-progress-bar entries" style={{ width: '100%' }}></div>
            </div>
          </div>

          <div className="myk9-show-stat-card">
            <div className="myk9-show-stat-layout">
              <div className="myk9-show-stat-icon trials">
                <Clock className="w-5 h-5" />
              </div>
              <div className="myk9-show-stat-content">
                <div className="myk9-show-stat-header">
                  <div className="myk9-show-stat-title">Pending Results</div>
                </div>
                <div className="myk9-show-stat-number">{stats.pendingResults}</div>
              </div>
            </div>
            <div className="myk9-show-stat-details">
              <span>Awaiting</span>
              <span>Entry</span>
            </div>
            <div className="myk9-show-stat-progress">
              <div
                className="myk9-show-stat-progress-bar trials"
                style={{
                  width: `${stats.totalEntries > 0 ? Math.round((stats.pendingResults / stats.totalEntries) * 100) : 0}%`,
                }}
              ></div>
            </div>
          </div>

          <div className="myk9-show-stat-card">
            <div className="myk9-show-stat-layout">
              <div className="myk9-show-stat-icon qualified">
                <Award className="w-5 h-5" />
              </div>
              <div className="myk9-show-stat-content">
                <div className="myk9-show-stat-header">
                  <div className="myk9-show-stat-title">Qualified</div>
                </div>
                <div className="myk9-show-stat-number">{stats.qualifiedCount}</div>
              </div>
            </div>
            <div className="myk9-show-stat-details">
              <span>Q: {stats.qualifiedCount}</span>
              <span>NQ: {stats.nqCount}</span>
            </div>
            <div className="myk9-show-stat-progress">
              <div
                className="myk9-show-stat-progress-bar qualified"
                style={{
                  width: `${stats.totalEntries > 0 ? Math.round((stats.qualifiedCount / stats.totalEntries) * 100) : 0}%`,
                }}
              ></div>
            </div>
          </div>

          <div className="myk9-show-stat-card">
            <div className="myk9-show-stat-layout">
              <div className="myk9-show-stat-icon classes">
                <FileText className="w-5 h-5" />
              </div>
              <div className="myk9-show-stat-content">
                <div className="myk9-show-stat-header">
                  <div className="myk9-show-stat-title">Complete</div>
                </div>
                <div className="myk9-show-stat-number">{stats.completionPercentage}%</div>
              </div>
            </div>
            <div className="myk9-show-stat-details">
              <span>Done: {stats.completedResults}</span>
              <span>Total: {stats.totalEntries}</span>
            </div>
            <div className="myk9-show-stat-progress">
              <div
                className="myk9-show-stat-progress-bar classes"
                style={{ width: `${stats.completionPercentage}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between border-b border-border mb-6">
            <TabsList className="bg-transparent border-0 rounded-none p-0 h-auto gap-6 justify-start">
              <TabsTrigger
                value="overview"
                className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="bulk"
                className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
              >
                Results Entry ({entries.length})
              </TabsTrigger>
              <TabsTrigger
                value="placements"
                className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
              >
                Placements
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    <div className="myk9-show-stat-progress">
                      <div
                        className="myk9-show-stat-progress-bar classes"
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
            <BulkResultEntry
              entries={entries as ScentWorkEntry[]}
              classConfig={classConfig}
              onResultsSubmit={async bulkResults => {
                // Process bulk results using our new handler
                for (const result of bulkResults) {
                  await handleResultUpdate(result.entryId, result);
                }
              }}
            />
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
        </Tabs>
      </div>
    </div>
  );
}
