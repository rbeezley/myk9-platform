/**
 * Offline Judge Interface Component
 *
 * Enhanced version of JudgeClassInterface with full offline support,
 * multi-format scoring, and integration with the new offline scoring system.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import '@/styles/myk9-show-details.css';

// Store and service integration
import { logger } from '@/services/LoggingService';
import {
  useOfflineScoringStore,
  useCurrentScoringSession,
  useJudgeAuth,
  useClassScoring,
  useSyncStatus,
} from '@/store/offlineScoringStore';

// Data fetching
import { useEntriesByClassQuery } from '@/hooks/queries/useEntriesDatabase';
import { mapDbEntryToUnifiedEntry, type DbEntryWithDog } from '@/services/mappers/scoringMappers';

// Types
import type { ScoringFormat, BaseScore, ValidationResult } from '@/types/scoring-types';
import type { UnifiedEntryData } from '@/types/unified-entry-types';

// Re-export types for backward compatibility
export type {
  OfflineJudgeInterfaceProps,
  ValidationError,
  JudgeView,
} from './OfflineJudgeInterface.types';

import type {
  OfflineJudgeInterfaceProps,
  JudgeView,
  AuthFormState,
} from './OfflineJudgeInterface.types';

// Extracted view components
import {
  StatusBar,
  AuthenticationView,
  SetupView,
  EntryListView,
  CompletedView,
  ScoresheetRenderer,
} from './OfflineJudgeInterfaceViews';

/**
 * Main offline judge interface component
 */
export function OfflineJudgeInterface({
  classId: propClassId,
  format: propFormat,
  className,
}: OfflineJudgeInterfaceProps) {
  const navigate = useNavigate();
  const { showId, trialId, classId: urlClassId } = useParams();
  const activeClassId = urlClassId || propClassId;

  // Store hooks
  const { judgeId: currentJudgeId, judgeName, isAuthenticated } = useJudgeAuth();
  const session = useCurrentScoringSession();
  const classScores = useClassScoring(activeClassId || '');
  const syncStatusData = useSyncStatus();

  const credentials = useMemo(
    () => ({ judgeId: currentJudgeId, judgeName, isAuthenticated }),
    [currentJudgeId, judgeName, isAuthenticated]
  );
  const currentEntryId = session?.entryId;
  const scores = useMemo(() => (Array.isArray(classScores) ? classScores : []), [classScores]);

  const validationErrors: Array<{ field: string; message: string }> = [];
  const isOffline = !syncStatusData.isOnline;
  const isSyncing = syncStatusData.processingCount > 0;

  const syncStatus: 'synced' | 'pending' | 'error' | 'idle' = useMemo(() => {
    if (syncStatusData.failedCount > 0) return 'error';
    if (syncStatusData.pendingCount > 0 || syncStatusData.processingCount > 0) return 'pending';
    return 'synced';
  }, [syncStatusData]);

  // Store actions
  const offlineScoringStore = useOfflineScoringStore();
  const {
    startJudgingSession,
    endJudgingSession,
    advanceWorkflowStep,
    getNextEntry,
    submitScore,
    setError,
    setEntryOrder,
  } = offlineScoringStore;
  const setCurrentEntry = useMemo(
    () => offlineScoringStore.setCurrentEntry,
    [offlineScoringStore.setCurrentEntry]
  );

  const forceSyncAll = useCallback(() => {
    const pending = offlineScoringStore.getPendingSyncItems();
    pending.forEach(item => {
      offlineScoringStore.updateSyncQueueItem(item.id, { status: 'processing' });
    });
    return Promise.resolve();
  }, [offlineScoringStore]);

  // Local state
  const [currentView, setCurrentView] = useState<JudgeView>('authentication');
  const [selectedFormat, setSelectedFormat] = useState<ScoringFormat>(propFormat || 'scent_work');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch entries from Supabase
  const { data: rawEntries } = useEntriesByClassQuery(activeClassId || '', !!activeClassId);

  const entries = useMemo<UnifiedEntryData[]>(() => {
    if (!rawEntries) return [];
    return (rawEntries as unknown as DbEntryWithDog[]).map(mapDbEntryToUnifiedEntry);
  }, [rawEntries]);

  useEffect(() => {
    if (entries.length > 0) {
      setEntryOrder(entries.map(e => e.id));
    }
  }, [entries, setEntryOrder]);

  // Authentication state
  const [authForm, setAuthForm] = useState<AuthFormState>({
    judgeId: '',
    judgeName: '',
    role: 'judge' as const,
    certifications: [],
    authorizedFormats: [selectedFormat],
  });

  useEffect(() => {
    if (currentJudgeId && credentials) {
      if (session?.isActive) {
        setCurrentView('scoring');
      } else {
        setCurrentView('setup');
      }
    } else {
      setCurrentView('authentication');
    }
  }, [currentJudgeId, credentials, session]);

  // --- Handlers ---

  const handleAuthentication = useCallback(async () => {
    if (!authForm.judgeId || !authForm.judgeName) {
      setError('Judge ID and name are required');
      return;
    }
    try {
      setIsLoading(true);
      setCurrentView('setup');
    } catch (error) {
      logger.error('Authentication failed:', 'scoring', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [authForm.judgeId, authForm.judgeName, setError]);

  const handleStartSession = async () => {
    if (!activeClassId || !currentJudgeId) {
      setError('Class ID and judge authentication required');
      return;
    }
    try {
      setIsLoading(true);
      await startJudgingSession(activeClassId, selectedFormat);
      setCurrentView('entry_list');
    } catch (error) {
      logger.error('Failed to start session:', 'scoring', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!session?.id) return;
    try {
      setIsLoading(true);
      await endJudgingSession(session?.id || '');
      setCurrentView('completed');
    } catch (error) {
      logger.error('Failed to end session:', 'scoring', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectEntry = useCallback(
    (entryId: string) => {
      if (session?.id) {
        setCurrentEntry(session.id, entryId);
      }
      setCurrentView('scoring');
      if (showId && trialId && activeClassId) {
        navigate(`/shows/${showId}/trials/${trialId}/classes/${activeClassId}/judge/${entryId}`, {
          replace: true,
        });
      }
    },
    [navigate, showId, trialId, activeClassId, setCurrentEntry, session?.id]
  );

  const handleScoreSubmit = async (score: BaseScore): Promise<ValidationResult> => {
    try {
      const scoreWithId = { ...score, id: `score-${Date.now()}` };
      await submitScore(currentEntryId || '', scoreWithId);
      const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
      if (result.isValid) {
        const nextEntryId = getNextEntry(currentEntryId || '');
        if (nextEntryId) {
          handleSelectEntry(nextEntryId);
        } else {
          setCurrentView('entry_list');
        }
      }
      return result;
    } catch (error) {
      logger.error('Score submission failed:', 'scoring', {}, error as Error);
      return {
        isValid: false,
        errors: [{ field: 'general', message: 'Submission failed', code: 'SUBMIT_ERROR' }],
        warnings: [],
      };
    }
  };

  const handleBackToList = () => {
    if (session?.id) {
      setCurrentEntry(session.id, '');
    }
    setCurrentView('entry_list');
    if (showId && trialId && activeClassId) {
      navigate(`/shows/${showId}/trials/${trialId}/classes/${activeClassId}/judge`, {
        replace: true,
      });
    }
  };

  const handleAdvanceWorkflow = async () => {
    try {
      advanceWorkflowStep('next');
    } catch (error) {
      logger.error('Failed to advance workflow:', 'scoring', {}, error as Error);
    }
  };

  // --- Computed values ---

  const progress = useMemo(() => {
    if (!session || entries.length === 0) return 0;
    return (session.completedEntries.length / entries.length) * 100;
  }, [session, entries]);

  const entriesWithStatus = useMemo(() => {
    return entries.map(entry => {
      const score = scores.find(s => s.entryId === entry.id);
      const isCompleted = session?.completedEntries.includes(entry.id) || !!score;
      const isCurrent = entry.id === currentEntryId;
      return {
        id: entry.id,
        armband: entry.armband,
        dogName: entry.dog,
        handlerName: entry.handler,
        isCompleted,
        isCurrent,
        score,
        status: isCompleted ? 'completed' : isCurrent ? 'in-progress' : 'pending',
      };
    });
  }, [entries, scores, session, currentEntryId]);

  // --- Render ---

  if (isLoading) {
    return (
      <div className={cn('min-h-screen bg-background flex items-center justify-center', className)}>
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen bg-background', className)}>
      {currentView !== 'authentication' && (
        <StatusBar
          isOffline={isOffline}
          isSyncing={isSyncing}
          syncStatus={syncStatus}
          progress={progress}
          sessionActive={!!session?.isActive}
          completedCount={session?.completedEntries.length ?? 0}
          totalCount={entries.length}
          onForceSync={forceSyncAll}
          onEndSession={handleEndSession}
        />
      )}

      <div className="container mx-auto px-6 pt-6 pb-8 max-w-7xl">
        {currentView === 'authentication' && (
          <AuthenticationView
            authForm={authForm}
            selectedFormat={selectedFormat}
            onAuthFormChange={setAuthForm}
            onFormatChange={setSelectedFormat}
            onAuthenticate={handleAuthentication}
          />
        )}

        {currentView === 'setup' && (
          <SetupView
            credentials={credentials}
            selectedFormat={selectedFormat}
            activeClassId={activeClassId}
            onStartSession={handleStartSession}
          />
        )}

        {currentView === 'entry_list' && (
          <EntryListView
            selectedFormat={selectedFormat}
            activeClassId={activeClassId}
            credentials={credentials}
            entryCount={entries.length}
            progress={progress}
            entriesWithStatus={entriesWithStatus}
            onAdvanceWorkflow={handleAdvanceWorkflow}
            onSelectEntry={handleSelectEntry}
          />
        )}

        {currentView === 'scoring' && (
          <ScoresheetRenderer
            selectedFormat={selectedFormat}
            currentEntry={entries.find(e => e.id === currentEntryId)}
            validationErrors={validationErrors}
            onScoreSubmit={handleScoreSubmit}
            onCancel={handleBackToList}
          />
        )}

        {currentView === 'review' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold">Review Results</h1>
          </div>
        )}

        {currentView === 'completed' && (
          <CompletedView onStartNew={() => setCurrentView('setup')} />
        )}
      </div>
    </div>
  );
}
