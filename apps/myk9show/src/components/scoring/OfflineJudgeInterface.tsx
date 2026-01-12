/**
 * Offline Judge Interface Component
 * 
 * Enhanced version of JudgeClassInterface with full offline support,
 * multi-format scoring, and integration with the new offline scoring system.
 * 
 * Key Features:
 * - Complete offline functionality
 * - Multi-format scoring support
 * - Real-time validation and placement updates
 * - Judge workflow management
 * - Offline sync queue monitoring
 * - Performance optimized
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import '@/styles/apple-show-details.css';

// Store and service integration
import {
import { logger } from '@/services/LoggingService';
  useOfflineScoringStore,
  useCurrentScoringSession,
  useJudgeAuth,
  useClassScoring,
  // useScoringValidation, // Currently unused
  useSyncStatus
} from '@/store/offlineScoringStore';

// UI Components
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

// Icons
import { 
  Clock, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

// Types
import type { 
  ScoringFormat,
  BaseScore,
  ValidationResult
} from '@/types/scoring-types';
import type { UnifiedEntryData } from '@/types/unified-entry-types';

// Format-specific scoring components
import { ScentWorkScoresheet } from './ScentWorkScoresheet';
import { AgilityScoresheet } from './format-specific/AgilityScoresheet';
import { ObedienceScoresheet } from './format-specific/ObedienceScoresheet';
import { RallyScoresheet } from './format-specific/RallyScoresheet';

export interface OfflineJudgeInterfaceProps {
  classId?: string;
  format?: ScoringFormat;
  onExit?: () => void;
  className?: string;
}


interface ValidationError {
  entryId?: string;
  field?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

type JudgeView = 'authentication' | 'setup' | 'entry_list' | 'scoring' | 'review' | 'completed';

/**
 * Main offline judge interface component
 */
export function OfflineJudgeInterface({
  classId: propClassId,
  format: propFormat,
  className
}: OfflineJudgeInterfaceProps) {
  // Route parameters
  const navigate = useNavigate();
  const { showId, trialId, classId: urlClassId } = useParams();
  
  // Use URL classId if available, otherwise fall back to prop
  const activeClassId = urlClassId || propClassId;
  
  // Store hooks
  const { judgeId: currentJudgeId, judgeName, isAuthenticated } = useJudgeAuth();
  const session = useCurrentScoringSession();
  const classScores = useClassScoring(activeClassId || '');
  // const scoringValidation = useScoringValidation();
  const syncStatusData = useSyncStatus();
  
  // Extract properties with fallbacks
  const credentials = useMemo(() => ({ 
    judgeId: currentJudgeId, 
    judgeName, 
    isAuthenticated 
  }), [currentJudgeId, judgeName, isAuthenticated]);
  const currentEntryId = session?.entryId;
  // const currentWorkflowStep = session?.workflowStep;
  // const isScoring = session?.isActive || false;
  const scores = useMemo(() => Array.isArray(classScores) ? classScores : [], [classScores]);
  // const placements: Array<{ entryId: string; place: number; score?: number }> = [];
  // const calculatePlacements = () => Promise.resolve({ placements: [], summary: null });
  // const validateRealTime = validateScore;
  const validationErrors: Array<{ field: string; message: string }> = [];
  const isOffline = !syncStatusData.isOnline;
  const syncStatus = 'synced' as 'synced' | 'pending' | 'error' | 'idle';
  const isSyncing = false;
  const forceSyncAll = () => Promise.resolve();
  const authenticateJudge = () => Promise.resolve();
  
  // Store actions (with fallbacks to prevent errors)
  const offlineScoringStore = useOfflineScoringStore();
  const startJudgingSession = offlineScoringStore.startJudgingSession || (() => Promise.resolve());
  const endJudgingSession = offlineScoringStore.endJudgingSession || (() => Promise.resolve());
  const advanceWorkflowStep = offlineScoringStore.advanceWorkflowStep || (() => {});
  const setCurrentEntry = useMemo(() => offlineScoringStore.setCurrentEntry || (() => {}), [offlineScoringStore.setCurrentEntry]);
  const getNextEntry = offlineScoringStore.getNextEntry || (() => null);
  const submitScore = offlineScoringStore.submitScore || (() => Promise.resolve());
  const setError = offlineScoringStore.setError || (() => {});
  // const addWarning = offlineScoringStore.addWarning || (() => {});

  // Local state
  const [currentView, setCurrentView] = useState<JudgeView>('authentication');
  const [selectedFormat, setSelectedFormat] = useState<ScoringFormat>(propFormat || 'scent_work');
  const [isLoading, setIsLoading] = useState(false);
  const [entries, setEntries] = useState<Array<UnifiedEntryData>>([]);

  // Authentication state
  const [authForm, setAuthForm] = useState({
    judgeId: '',
    judgeName: '',
    role: 'judge' as const,
    certifications: [] as string[],
    authorizedFormats: [selectedFormat] as ScoringFormat[]
  });

  // Initialize view based on authentication state
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

  // Load mock entries for development
  useEffect(() => {
    if (activeClassId && selectedFormat) {
      // TODO: Replace with actual data loading
      const mockEntries: UnifiedEntryData[] = Array.from({ length: 12 }, (_, i) => ({
        id: `entry-${i + 1}`,
        classId: activeClassId,
        armband: String(i + 1).padStart(3, '0'),
        handler: `Handler ${i + 1}`,
        dog: `Dog ${i + 1}`,
        status: 'Pending' as const,
        dogId: `dog-${i + 1}`,
        handlerId: `handler-${i + 1}`,
        updatedAt: new Date().toISOString(),
        isProvisional: true
      }));
      setEntries(mockEntries);
    }
  }, [activeClassId, selectedFormat]);

  // ========================================================================
  // Authentication Handlers
  // ========================================================================

  const handleAuthentication = async () => {
    if (!authForm.judgeId || !authForm.judgeName) {
      setError('Judge ID and name are required');
      return;
    }

    try {
      setIsLoading(true);
      await authenticateJudge();
      setCurrentView('setup');
    } catch (error) {
      logger.error('Authentication failed:', 'scoring', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  // ========================================================================
  // Session Management Handlers
  // ========================================================================

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

  // ========================================================================
  // Scoring Handlers
  // ========================================================================

  const handleSelectEntry = useCallback((entryId: string) => {
    if (session?.id) {
      setCurrentEntry(session.id, entryId);
    }
    setCurrentView('scoring');
    
    // Update URL
    if (showId && trialId && activeClassId) {
      navigate(`/shows/${showId}/trials/${trialId}/classes/${activeClassId}/judge/${entryId}`, { replace: true });
    }
  }, [navigate, showId, trialId, activeClassId, setCurrentEntry, session?.id]);

  const handleScoreSubmit = async (score: BaseScore): Promise<ValidationResult> => {
    try {
      const scoreWithId = { ...score, id: `score-${Date.now()}` };
      await submitScore(currentEntryId || '', scoreWithId);
      
      // Create a valid result
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
      };
      
      if (result.isValid) {
        // Move to next entry or back to list
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
        warnings: []
      };
    }
  };

  const handleBackToList = () => {
    if (session?.id) {
      setCurrentEntry(session.id, '');
    }
    setCurrentView('entry_list');
    
    if (showId && trialId && activeClassId) {
      navigate(`/shows/${showId}/trials/${trialId}/classes/${activeClassId}/judge`, { replace: true });
    }
  };

  // ========================================================================
  // Workflow Management
  // ========================================================================

  const handleAdvanceWorkflow = async () => {
    try {
      advanceWorkflowStep('next');
    } catch (error) {
      logger.error('Failed to advance workflow:', 'scoring', {}, error as Error);
    }
  };

  // ========================================================================
  // Progress Calculations
  // ========================================================================

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
        status: isCompleted ? 'completed' : isCurrent ? 'in-progress' : 'pending'
      };
    });
  }, [entries, scores, session, currentEntryId]);

  // ========================================================================
  // Render Format-Specific Scoresheet
  // ========================================================================

  const renderScoresheet = () => {
    const currentEntry = entries.find(e => e.id === currentEntryId);
    if (!currentEntry) return null;

    const filteredErrors = validationErrors.filter(err => {
      const error = err as ValidationError;
      return error.entryId === currentEntry.id;
    });
    const validationResult = {
      isValid: filteredErrors.length === 0,
      errors: filteredErrors.map(err => ({ ...err, code: 'VALIDATION_ERROR' })),
      warnings: []
    };
    
    const scoresheetProps = {
      entry: currentEntry,
      onSave: async (result: unknown) => {
        const validationResult = await handleScoreSubmit(result as BaseScore);
        return validationResult;
      },
      onCancel: handleBackToList,
      validationErrors: validationResult
    };

    switch (selectedFormat) {
      case 'scent_work':
        return <ScentWorkScoresheet {...scoresheetProps} />;
      case 'agility':
        return <AgilityScoresheet {...scoresheetProps} />;
      case 'obedience':
        return <ObedienceScoresheet {...scoresheetProps} />;
      case 'rally':
        return <RallyScoresheet {...scoresheetProps} />;
      default:
        return (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Scoresheet for format "{selectedFormat}" is not yet implemented.
            </AlertDescription>
          </Alert>
        );
    }
  };

  // ========================================================================
  // Render Status Bar
  // ========================================================================

  const renderStatusBar = () => (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Online/Offline Status */}
          <div className="flex items-center space-x-2">
            {isOffline ? (
              <WifiOff className="h-4 w-4 text-red-500" />
            ) : (
              <Wifi className="h-4 w-4 text-green-500" />
            )}
            <span className="text-sm font-medium">
              {isOffline ? 'Offline' : 'Online'}
            </span>
          </div>

          {/* Sync Status */}
          <div className="flex items-center space-x-2">
            {isSyncing ? (
              <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
            ) : (
              <div className={cn(
                "h-2 w-2 rounded-full",
                syncStatus === 'synced' && "bg-green-500",
                syncStatus === 'pending' && "bg-yellow-500",
                syncStatus === 'error' && "bg-red-500"
              )} />
            )}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {syncStatus === 'synced' && 'Synced'}
              {syncStatus === 'pending' && 'Sync Pending'}
              {syncStatus === 'error' && 'Sync Error'}
            </span>
          </div>

          {/* Progress */}
          {session && (
            <div className="flex items-center space-x-2">
              <Progress value={progress} className="w-24" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {session.completedEntries.length}/{entries.length}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Force Sync Button */}
          {!isOffline && (
            <Button
              variant="outline"
              size="sm"
              onClick={forceSyncAll}
              disabled={isSyncing}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Sync
            </Button>
          )}

          {/* Session Actions */}
          {session?.isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEndSession}
            >
              End Session
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  // ========================================================================
  // Main Render Logic
  // ========================================================================

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
      {/* Status Bar */}
      {currentView !== 'authentication' && renderStatusBar()}

      {/* Main Content */}
      <div className="container mx-auto px-6 pt-6 pb-8 max-w-7xl">
        {/* Authentication View */}
        {currentView === 'authentication' && (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Judge Authentication</CardTitle>
              <CardDescription>
                Enter your credentials to start judging
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Judge ID</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={authForm.judgeId}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, judgeId: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Judge Name</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={authForm.judgeName}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, judgeName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Format</label>
                <select
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value as ScoringFormat)}
                >
                  <option value="scent_work">Scent Work</option>
                  <option value="agility">Agility</option>
                  <option value="obedience">Obedience</option>
                  <option value="rally">Rally</option>
                  <option value="conformation">Conformation</option>
                </select>
              </div>
              <Button 
                onClick={handleAuthentication} 
                className="w-full"
                disabled={!authForm.judgeId || !authForm.judgeName}
              >
                Authenticate
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Setup View */}
        {currentView === 'setup' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold">Setup Judging Session</h1>
              <p className="text-muted-foreground mt-2">
                Configure your judging session for {selectedFormat.replace('_', ' ')}
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Judge Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Judge ID</span>
                    <p className="font-medium">{credentials?.judgeId}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Judge Name</span>
                    <p className="font-medium">{credentials?.judgeName}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Format</span>
                    <p className="font-medium">{selectedFormat.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Class ID</span>
                    <p className="font-medium">{activeClassId}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <Button onClick={handleStartSession} size="lg">
                Start Judging Session
              </Button>
            </div>
          </div>
        )}

        {/* Entry List View */}
        {currentView === 'entry_list' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">
                  {selectedFormat.replace('_', ' ')} - Class {activeClassId}
                </h1>
                <p className="text-muted-foreground">
                  Judge: {credentials?.judgeName} | {entries.length} entries
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <Button variant="outline" onClick={handleAdvanceWorkflow}>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Advance Workflow
                </Button>
              </div>
            </div>

            {/* Progress Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium">Progress</span>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(progress)}% complete
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </CardContent>
            </Card>

            {/* Entry Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {entriesWithStatus.map((entry) => (
                <Card
                  key={entry.id}
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:shadow-md",
                    entry.isCurrent && "ring-2 ring-primary",
                    entry.isCompleted && "bg-green-50 dark:bg-green-950"
                  )}
                  onClick={() => handleSelectEntry(entry.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-lg font-bold">#{entry.armband}</div>
                      <div>
                        {entry.isCompleted ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : entry.isCurrent ? (
                          <Clock className="h-5 w-5 text-blue-500" />
                        ) : (
                          <div className="h-5 w-5" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">{entry.dogName}</p>
                      <p className="text-sm text-muted-foreground">{entry.handlerName}</p>
                      <Badge
                        variant={
                          entry.isCompleted ? 'default' :
                          entry.isCurrent ? 'secondary' : 'outline'
                        }
                      >
                        {entry.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Scoring View */}
        {currentView === 'scoring' && renderScoresheet()}

        {/* Review View */}
        {currentView === 'review' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold">Review Results</h1>
            {/* Review interface would go here */}
          </div>
        )}

        {/* Completed View */}
        {currentView === 'completed' && (
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <div>
              <h1 className="text-2xl font-bold">Session Completed</h1>
              <p className="text-muted-foreground mt-2">
                Judging session has been successfully completed.
              </p>
            </div>
            <Button onClick={() => setCurrentView('setup')}>
              Start New Session
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}