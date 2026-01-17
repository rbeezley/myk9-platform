/**
 * Live Score Updates Component
 * 
 * Real-time score display with sync status for live scoring sessions.
 * Provides visual feedback on score submission, sync status, and placement changes.
 * Optimized for judge workflow with Apple-inspired design.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// UI Components
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// Icons
import { logger } from '@/services/LoggingService';
import {
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  Trophy,
  Target,
  Timer,
  User,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';

// Hooks and Services
import { useOfflineScoringStore } from '@/store/offlineScoringStore';
import { offlineScoringService } from '@/services/scoring/OfflineScoringService';
import { placementCalculatorService } from '@/services/scoring/PlacementCalculatorService';

// Types
import type { BaseScore, ScoringFormat, PlacementEntry } from '@/types/scoring-types';
import type { QualificationStatus } from '@/types/scent-work-types';

export interface LiveScoreUpdatesProps {
  classId: string;
  format: ScoringFormat;
  showOnlyQualified?: boolean;
  maxDisplayEntries?: number;
  onScoreSelect?: (entryId: string) => void;
  className?: string;
}

interface LiveScoreEntry {
  entryId: string;
  dogName: string;
  handlerName: string;
  armband: string;
  score: BaseScore;
  placement?: number;
  placementChange?: 'up' | 'down' | 'same';
  isNew?: boolean;
}

interface SyncStatusInfo {
  isOnline: boolean;
  pendingCount: number;
  lastSyncTime?: Date;
  syncInProgress: boolean;
}

/**
 * Live score updates with real-time sync status
 */
export function LiveScoreUpdates({
  classId,
  format,
  showOnlyQualified = false,
  maxDisplayEntries = 10,
  onScoreSelect,
  className
}: LiveScoreUpdatesProps) {
  // Store hooks
  const { 
    getScoresByClass, 
    getPendingSyncItems, 
    isOffline
  } = useOfflineScoringStore();

  // Local state
  const [scores, setScores] = useState<BaseScore[]>([]);
  void scores; // Suppress unused variable warning
  const [placements, setPlacements] = useState<PlacementEntry[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo>({
    isOnline: !isOffline,
    pendingCount: 0,
    syncInProgress: false
  });
  const [previousPlacements, setPreviousPlacements] = useState<Map<string, number>>(new Map());
  const [newlyAddedEntries, setNewlyAddedEntries] = useState<Set<string>>(new Set());

  // Load scores and placements
  const loadData = useCallback(async () => {
    try {
      // Get current scores
      const currentScores = getScoresByClass(classId);
      setScores(currentScores);

      // Calculate current placements
      if (currentScores.length > 0) {
        const calculation = await placementCalculatorService.calculatePlacements(
          classId,
          format,
          currentScores
        );
        setPlacements(calculation.placements);

        // Track placement changes
        const currentPlacementMap = new Map<string, number>();
        calculation.placements.forEach(p => {
          if (p.placement) {
            currentPlacementMap.set(p.entryId, p.placement);
          }
        });

        // Compare with previous placements to detect changes
        const changes = new Map<string, 'up' | 'down' | 'same'>();
        for (const [entryId, currentPlacement] of currentPlacementMap.entries()) {
          const previousPlacement = previousPlacements.get(entryId);
          if (previousPlacement !== undefined) {
            if (currentPlacement < previousPlacement) {
              changes.set(entryId, 'up');
            } else if (currentPlacement > previousPlacement) {
              changes.set(entryId, 'down');
            } else {
              changes.set(entryId, 'same');
            }
          }
        }

        setPreviousPlacements(currentPlacementMap);
      }

      // Update sync status
      const pendingItems = getPendingSyncItems();
      setSyncStatus(prev => ({
        ...prev,
        isOnline: navigator.onLine && !isOffline,
        pendingCount: pendingItems.length
      }));

    } catch (error) {
      logger.error('Failed to load live score data:', 'scoring', {}, error as Error);
    }
  }, [classId, format, getScoresByClass, getPendingSyncItems, isOffline, previousPlacements]);

  // Real-time data updates
  useEffect(() => {
    loadData();
    
    // Set up periodic refresh for live updates
    const refreshInterval = setInterval(loadData, 2000); // Every 2 seconds

    // Listen for scoring events
    const handleScoringEvent = (event: { classId: string; type: string; entryId: string }) => {
      if (event.classId === classId) {
        loadData();
        
        // Mark new entries for animation
        if (event.type === 'score_submitted') {
          setNewlyAddedEntries(prev => new Set([...prev, event.entryId]));
          // Clear the "new" flag after animation
          setTimeout(() => {
            setNewlyAddedEntries(prev => {
              const updated = new Set(prev);
              updated.delete(event.entryId);
              return updated;
            });
          }, 3000);
        }
      }
    };

    // Type-safe event handler
    const handleScoringEventTyped = (data: unknown) => {
      handleScoringEvent(data as { classId: string; type: string; entryId: string });
    };

    offlineScoringService.on('scoring_event', handleScoringEventTyped);

    return () => {
      clearInterval(refreshInterval);
      offlineScoringService.off('scoring_event', handleScoringEventTyped);
    };
  }, [classId, loadData]);

  // Prepare display data
  const displayEntries = useMemo((): LiveScoreEntry[] => {
    let entries = placements.map(placement => {
      const metadata = {
        dogName: placement.dogName,
        handlerName: placement.handlerName,
        armband: placement.armband
      };

      return {
        entryId: placement.entryId,
        dogName: metadata.dogName,
        handlerName: metadata.handlerName,
        armband: metadata.armband,
        score: placement.rawScore,
        placement: placement.placement,
        placementChange: (() => {
          if (!previousPlacements.has(placement.entryId) || !placement.placement) {
            return undefined;
          }
          const previousPlacement = previousPlacements.get(placement.entryId);
          if (previousPlacement === undefined) return undefined;
          
          if (placement.placement === previousPlacement) return 'same' as const;
          if (placement.placement < previousPlacement) return 'up' as const;
          return 'down' as const;
        })(),
        isNew: newlyAddedEntries.has(placement.entryId)
      };
    });

    // Filter by qualification if requested
    if (showOnlyQualified) {
      entries = entries.filter(entry => entry.score.qualification === 'Qualified');
    }

    // Limit display count
    if (maxDisplayEntries > 0) {
      entries = entries.slice(0, maxDisplayEntries);
    }

    return entries;
  }, [placements, previousPlacements, newlyAddedEntries, showOnlyQualified, maxDisplayEntries]);

  // Format score display based on format
  const formatScoreDisplay = useCallback((score: BaseScore): { primary: string; secondary?: string } => {
    switch (format) {
      case 'scent_work': {
        const scentScore = score as BaseScore & { searchTime?: number; totalSearchTime?: number; totalFaults?: number };
        const time = scentScore.searchTime || scentScore.totalSearchTime || 0;
        const faults = scentScore.faults || scentScore.totalFaults || 0;
        return { 
          primary: `${(time / 1000).toFixed(2)}s`, 
          secondary: faults > 0 ? `${faults}F` : undefined 
        };
      }
      
      case 'agility': {
        const agilityScore = score as BaseScore & { courseTime: number; totalFaults: number };
        return { 
          primary: `${(agilityScore.courseTime / 1000).toFixed(2)}s`, 
          secondary: agilityScore.totalFaults > 0 ? `${agilityScore.totalFaults}F` : undefined 
        };
      }
      
      case 'obedience': {
        const obedienceScore = score as BaseScore & { totalScore: number; maximumScore: number };
        return { 
          primary: `${obedienceScore.totalScore}/${obedienceScore.maximumScore}` 
        };
      }
      
      case 'rally': {
        const rallyScore = score as BaseScore & { finalScore: number; courseTime: number };
        return { 
          primary: `${rallyScore.finalScore}`,
          secondary: `${(rallyScore.courseTime / 1000).toFixed(1)}s`
        };
      }
      
      default:
        return { primary: 'Score' };
    }
  }, [format]);

  // Get qualification status styling
  const getQualificationStyling = (qualification: QualificationStatus) => {
    switch (qualification) {
      case 'Qualified':
        return 'bg-success-green/10 text-success-green border-success-green/20';
      case 'Not Qualified':
        return 'bg-error-red/10 text-error-red border-error-red/20';
      case 'Excused':
        return 'bg-muted text-muted-foreground border-border';
      case 'Eliminated':
        return 'bg-error-red/10 text-error-red border-error-red/20';
      case 'Absent':
        return 'bg-muted text-muted-foreground border-border';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  // Get placement change icon
  const getPlacementChangeIcon = (change?: 'up' | 'down' | 'same') => {
    switch (change) {
      case 'up':
        return <ArrowUp className="h-3 w-3 text-success-green" />;
      case 'down':
        return <ArrowDown className="h-3 w-3 text-error-red" />;
      case 'same':
        return <Minus className="h-3 w-3 text-muted-foreground" />;
      default:
        return null;
    }
  };

  // Sync status actions
  const handleForcSync = useCallback(async () => {
    setSyncStatus(prev => ({ ...prev, syncInProgress: true }));
    try {
      await offlineScoringService.forceSyncAll();
      loadData();
    } catch (error) {
      logger.error('Force sync failed:', 'scoring', {}, error as Error);
    } finally {
      setSyncStatus(prev => ({ ...prev, syncInProgress: false }));
    }
  }, [loadData]);

  return (
    <Card className={cn(
      "bg-card/95 backdrop-blur-sm border-border/50 shadow-lg",
      className
    )}>
      <CardContent className="p-6 space-y-4">
        {/* Header with sync status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Live Scores</h3>
            </div>
            <Badge variant="outline" className="text-xs">
              {displayEntries.length} {showOnlyQualified ? 'Qualified' : 'Entries'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Connection status */}
            <div className="flex items-center gap-1">
              {syncStatus.isOnline ? (
                <Wifi className="h-4 w-4 text-success-green" />
              ) : (
                <WifiOff className="h-4 w-4 text-error-red" />
              )}
              <span className="text-xs text-muted-foreground">
                {syncStatus.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Pending sync count */}
            {syncStatus.pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {syncStatus.pendingCount} pending
              </Badge>
            )}

            {/* Sync button */}
            {syncStatus.pendingCount > 0 && syncStatus.isOnline && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleForcSync}
                disabled={syncStatus.syncInProgress}
                className="h-8 px-2"
              >
                <RefreshCw className={cn(
                  "h-3 w-3",
                  syncStatus.syncInProgress && "animate-spin"
                )} />
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Score list */}
        <ScrollArea className="h-80">
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {displayEntries.map((entry, index) => (
                <motion.div
                  key={entry.entryId}
                  initial={entry.isNew ? { opacity: 0, x: -20, scale: 0.95 } : false}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ 
                    duration: 0.3, 
                    ease: [0.25, 0.46, 0.45, 0.94],
                    delay: entry.isNew ? index * 0.05 : 0
                  }}
                  className={cn(
                    "p-3 rounded-lg border border-border/50 bg-background/50",
                    "hover:bg-accent/50 transition-colors cursor-pointer",
                    entry.isNew && "ring-2 ring-primary/20 bg-primary/5"
                  )}
                  onClick={() => onScoreSelect?.(entry.entryId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Placement */}
                      <div className="flex items-center gap-1 min-w-[3rem]">
                        {entry.placement && (
                          <>
                            <span className="text-lg font-bold text-foreground">
                              {entry.placement}
                            </span>
                            {getPlacementChangeIcon(entry.placementChange)}
                          </>
                        )}
                      </div>

                      {/* Dog info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground truncate">
                            {entry.dogName}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            #{entry.armband}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span className="truncate">{entry.handlerName}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Score display */}
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          {format === 'scent_work' && <Timer className="h-3 w-3 text-muted-foreground" />}
                          {format === 'agility' && <Target className="h-3 w-3 text-muted-foreground" />}
                          <span className="font-mono text-sm font-medium">
                            {formatScoreDisplay(entry.score).primary}
                          </span>
                        </div>
                        {formatScoreDisplay(entry.score).secondary && (
                          <span className="text-xs text-muted-foreground">
                            {formatScoreDisplay(entry.score).secondary}
                          </span>
                        )}
                      </div>

                      {/* Qualification status */}
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs",
                          getQualificationStyling(entry.score.qualification)
                        )}
                      >
                        {entry.score.qualification === 'Qualified' ? 'Q' : 
                         entry.score.qualification === 'Not Qualified' ? 'NQ' :
                         entry.score.qualification.charAt(0)}
                      </Badge>

                      {/* Sync status */}
                      <div className="flex items-center">
                        {entry.score.syncStatus === 'synced' && (
                          <CheckCircle2 className="h-3 w-3 text-success-green" />
                        )}
                        {entry.score.syncStatus === 'pending' && (
                          <Clock className="h-3 w-3 text-warning-orange" />
                        )}
                        {entry.score.syncStatus === 'conflict' && (
                          <AlertCircle className="h-3 w-3 text-error-red" />
                        )}
                        {entry.score.syncStatus === 'error' && (
                          <AlertCircle className="h-3 w-3 text-error-red" />
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {displayEntries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No scores yet</p>
                <p className="text-xs">Scores will appear here as they are submitted</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer info */}
        {syncStatus.lastSyncTime && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border/50">
            Last sync: {syncStatus.lastSyncTime.toLocaleTimeString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LiveScoreUpdates;