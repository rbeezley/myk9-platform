/**
 * Judge Class Interface Component
 * 
 * Main workflow component for judges to navigate between entries
 * and complete scoresheets. Orchestrates the complete judging process
 * from entry selection to result submission.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { cn } from '@/lib/utils';
import '@/styles/apple-show-details.css';

// UI Components
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator';

// Feature Components
import { ResultEntryNavigation, type EntryWithResult } from './ResultEntryNavigation';
import { ScentWorkScoresheet } from './ScentWorkScoresheet';

// Types and utilities
import type { 
  ScentWorkResult
} from '@/types/scent-work-types';
import type { ValidationResult } from '@/types/scoring-types';
import { getTimeLimit } from '@/types/scent-work-types';

// Mock data for development - replace with actual data fetching
import { generateMockScentWorkEntries } from '@/utils/mockScentWorkData';

export interface JudgeClassInterfaceProps {
  classId?: string; // Now optional, will use URL params if not provided
  onExit?: () => void;
  className?: string;
}

type JudgeView = 'navigation' | 'scoresheet';

/**
 * Main judge interface for managing class judging workflow
 * 
 * Features:
 * - Entry navigation with progress tracking
 * - Seamless transition to scoresheet
 * - Result persistence and validation
 * - Auto-save functionality
 * - Progress restoration on reload
 */
export function JudgeClassInterface({
  classId: propClassId,
  className
}: JudgeClassInterfaceProps) {
  // Get route parameters
  const navigate = useNavigate();
  const { showId, trialId, classId: urlClassId, entryId } = useParams();
  
  // Use URL classId if available, otherwise fall back to prop
  const activeClassId = urlClassId || propClassId;
  
  // Current view state
  const [currentView, setCurrentView] = useState<JudgeView>('navigation');
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(entryId || null);
  
  // Data state
  const [entries, setEntries] = useState<EntryWithResult[]>([]);
  
  // Initialize results from localStorage for development persistence through hot reloads
  const [results, setResults] = useState<Map<string, ScentWorkResult>>(() => {
    if (typeof window !== 'undefined' && activeClassId) {
      const stored = localStorage.getItem(`judge-results-${activeClassId}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const resultsMap = new Map(Object.entries(parsed));
          logger.debug('Loaded results from localStorage', 'scoring', { resultsCount: resultsMap.size });
          return resultsMap;
        } catch (e) {
          logger.warn('Failed to parse stored results', 'scoring', {}, e as Error);
        }
      }
    }
    logger.debug('No stored results found, starting with empty Map', 'scoring');
    return new Map();
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Class information - would come from API
  const [classInfo, setClassInfo] = useState({
    element: 'Container' as const,
    level: 'Novice' as const,
    judge: 'Judge Name',
    totalEntries: 0,
    maxTime: 120000
  });

  // Load class data on mount
  useEffect(() => {
    const loadClassData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // TODO: Replace with actual API calls
        const mockEntries = generateMockScentWorkEntries(activeClassId || 'default-class', {
          element: classInfo.element,
          level: classInfo.level,
          count: 12 // Generate 12 mock entries
        });
        
        // Convert to EntryWithResult format
        const entriesWithResults: EntryWithResult[] = mockEntries.map(entry => ({
          ...entry,
          navigationStatus: 'pending' as const,
          isCurrentEntry: false
        }));
        
        setEntries(entriesWithResults);
        setClassInfo(prev => ({
          ...prev,
          totalEntries: mockEntries.length,
          maxTime: getTimeLimit(classInfo.element, classInfo.level)
        }));
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load class data');
      } finally {
        setIsLoading(false);
      }
    };

    loadClassData();
  }, [activeClassId, classInfo.element, classInfo.level]);

  // Calculate placements for qualified entries
  const calculatePlacements = useCallback((resultsMap: Map<string, ScentWorkResult>) => {
    const placements = new Map<string, number>();
    
    // Get all qualified entries with results
    const qualifiedEntries = Array.from(resultsMap.entries())
      .filter(([, result]) => result.qualification === 'Qualified')
      .map(([entryId, result]) => ({ entryId, result }));
    
    if (qualifiedEntries.length === 0) {
      return placements;
    }
    
    // Sort by: 1) Faults (ascending), 2) Time (ascending)
    qualifiedEntries.sort((a, b) => {
      // Primary: fewer faults wins
      if (a.result.faults !== b.result.faults) {
        return a.result.faults - b.result.faults;
      }
      
      // Secondary: faster time wins
      return a.result.searchTime - b.result.searchTime;
    });
    
    // Assign placements (handle ties)
    let currentPlace = 1;
    for (let i = 0; i < qualifiedEntries.length; i++) {
      const current = qualifiedEntries[i];
      
      // Check if this entry ties with the previous one
      if (i > 0) {
        const previous = qualifiedEntries[i - 1];
        const sameFaults = current.result.faults === previous.result.faults;
        const sameTime = current.result.searchTime === previous.result.searchTime;
        
        if (!(sameFaults && sameTime)) {
          // No tie, advance placement
          currentPlace = i + 1;
        }
        // If it's a tie, keep the same placement
      }
      
      placements.set(current.entryId, currentPlace);
    }
    
    logger.debug('Calculated placements', 'scoring', { placementsCount: placements.size });
    return placements;
  }, []);

  // Update entry statuses based on results and calculate placements
  const entriesWithStatus = useMemo(() => {
    const placements = calculatePlacements(results);
    
    return entries.map(entry => {
      const result = results.get(entry.id);
      const isCurrentEntry = entry.id === currentEntryId;
      const placement = placements.get(entry.id);
      
      let navigationStatus: EntryWithResult['navigationStatus'] = 'pending';
      if (result) {
        navigationStatus = 'completed';
      } else if (isCurrentEntry && currentView === 'scoresheet') {
        navigationStatus = 'in-progress';
      }
      
      return {
        ...entry,
        navigationStatus,
        result,
        placement,
        isCurrentEntry
      };
    });
  }, [entries, results, currentEntryId, currentView, calculatePlacements]);

  // Navigation handlers
  const handleSelectEntry = useCallback((entryId: string) => {
    setCurrentEntryId(entryId);
    setCurrentView('scoresheet');
    
    // Use replace instead of push to avoid component remounting
    if (showId && trialId && activeClassId) {
      navigate(`/shows/${showId}/trials/${trialId}/classes/${activeClassId}/judge/${entryId}`, { replace: true });
    }
  }, [navigate, showId, trialId, activeClassId]);

  const handleBackToNavigation = useCallback(() => {
    setCurrentView('navigation');
    setCurrentEntryId(null);
    
    // Use replace instead of push to avoid component remounting
    if (showId && trialId && activeClassId) {
      navigate(`/shows/${showId}/trials/${trialId}/classes/${activeClassId}/judge`, { replace: true });
    }
  }, [navigate, showId, trialId, activeClassId]);

  const handleStartJudging = useCallback(() => {
    // Start with first entry
    if (entries.length > 0) {
      handleSelectEntry(entries[0].id);
    }
  }, [entries, handleSelectEntry]);

  // Result management
  const handleSaveResult = useCallback(async (result: ScentWorkResult): Promise<ValidationResult> => {
    try {
      // TODO: Replace with actual API call
      logger.debug('Saving result for entry', 'scoring', { entryId: result.entryId });
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update local state and persist to localStorage
      setResults(prev => {
        const newResults = new Map(prev).set(result.entryId, result);
        
        // Persist to localStorage for development hot reload survival
        if (typeof window !== 'undefined' && activeClassId) {
          const resultsObj = Object.fromEntries(newResults);
          localStorage.setItem(`judge-results-${activeClassId}`, JSON.stringify(resultsObj));
          logger.debug('Results persisted to localStorage', 'scoring', { resultsCount: Object.keys(resultsObj).length });
        }
        
        return newResults;
      });
      
      // Always go back to navigation after saving so judge can select next entry
      setTimeout(() => {
        handleBackToNavigation();
      }, 1000);
      
      return {
        isValid: true,
        errors: [],
        warnings: []
      };
      
    } catch (err) {
      logger.error('Failed to save result', 'scoring', { entryId: result.entryId }, err as Error);
      return {
        isValid: false,
        errors: [{ field: 'general', message: err instanceof Error ? err.message : 'Failed to save result', code: 'SAVE_ERROR' }],
        warnings: []
      };
    }
  }, [handleBackToNavigation, activeClassId]);

  const handleCancelScoresheet = useCallback(() => {
    handleBackToNavigation();
  }, [handleBackToNavigation]);


  // Get current entry for scoresheet
  const currentEntry = useMemo(() => {
    if (!currentEntryId) return null;
    return entries.find(e => e.id === currentEntryId) || null;
  }, [currentEntryId, entries]);


  // Generate breadcrumbs manually since we only have IDs, not full objects
  const breadcrumbItems = useMemo(() => {
    type BreadcrumbItem = { label: string; href?: string; onClick?: () => void; isCurrentPage?: boolean };
    const items: BreadcrumbItem[] = [];
    
    if (showId) {
      items.push({
        label: 'Shows',
        href: '/shows'
      });
      items.push({
        label: 'Show Details', // We don't have the show name
        href: `/shows/${showId}`
      });
    }
    
    if (trialId) {
      items.push({
        label: 'Trial Details', // We don't have the trial name
        href: `/shows/${showId}/trials/${trialId}`
      });
    }
    
    if (currentView === 'scoresheet') {
      // When in scoresheet view, show navigation back to entry list
      items.push({
        label: `${classInfo.element} ${classInfo.level} - Judging`,
        onClick: handleBackToNavigation // Use click handler to go back to navigation
      });
      
      // Current page - specific entry
      if (currentEntry) {
        items.push({
          label: `#${currentEntry.displayInfo.armband} - ${currentEntry.displayInfo.dogName}`,
          isCurrentPage: true
        });
      }
    } else {
      // When in navigation view, this is the current page
      items.push({
        label: `${classInfo.element} ${classInfo.level} - Judging`,
        isCurrentPage: true
      });
    }
    
    return items;
  }, [showId, trialId, classInfo.element, classInfo.level, currentView, currentEntry, handleBackToNavigation]);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center', className)}>
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading class data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center', className)}>
        <Alert className="max-w-md">
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen bg-background', className)}>

      {/* Main Content */}
      <div className="container mx-auto px-6 pt-20 pb-8 max-w-7xl">
        {/* Header with Breadcrumbs and Sync Status */}
        <div className="flex items-center justify-between mb-6">
          <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />
          
          {/* Sync Status for Scoring */}
          <div className="flex items-center gap-3">
            <SyncStatusIndicator
              status="synced" // Would come from judging store
              entityType="scoring"
              showLabel
              lastSyncAt={new Date()} // Would come from actual sync timestamp
              className="text-sm"
            />
          </div>
        </div>
        
        {currentView === 'navigation' ? (
          <ResultEntryNavigation
            entries={entriesWithStatus}
            currentEntryId={currentEntryId || undefined}
            classInfo={{
              element: classInfo.element,
              level: classInfo.level,
              judge: classInfo.judge,
              totalEntries: classInfo.totalEntries
            }}
            onSelectEntry={handleSelectEntry}
            onStartJudging={handleStartJudging}
            showProgress={true}
          />
        ) : (
          currentEntry && (
            <ScentWorkScoresheet
              entry={currentEntry}
              onSave={handleSaveResult}
              onCancel={handleCancelScoresheet}
            />
          )
        )}
      </div>
    </div>
  );
}