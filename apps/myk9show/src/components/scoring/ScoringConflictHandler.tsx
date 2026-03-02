/**
 * Scoring Conflict Handler Component
 * 
 * Handles conflicts between judges/scores in multi-judge scenarios.
 * Provides resolution interfaces and conflict management workflows
 * with Premium design for clear decision making.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { logger } from '@/services/LoggingService';
import {
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

// Icons
import { 
  AlertTriangle, 
  Users, 
  Scale, 
  Clock, 
  CheckCircle2, 
 
  Eye,
  Gavel,
  ArrowRight,
  Info,
  User
} from 'lucide-react';

// Types
import type { 
  BaseScore, 
  MultiJudgeScore, 
  ConflictResolution,
  ScoringFormat 
} from '@/types/scoring-types';
import type { QualificationStatus } from '@/types/scent-work-types';

// Hooks and Services
import { useOfflineScoringStore } from '@/store/offlineScoringStore';
import { offlineScoringService } from '@/services/scoring/OfflineScoringService';

export interface ScoringConflictHandlerProps {
  classId: string;
  format: ScoringFormat;
  onConflictResolved?: (entryId: string, resolution: ConflictResolution) => void;
  onViewScore?: (entryId: string, judgeId: string) => void;
  className?: string;
}

interface ConflictItem {
  entryId: string;
  dogName: string;
  handlerName: string;
  armband: string;
  multiJudgeScore: MultiJudgeScore;
  severity: 'high' | 'medium' | 'low';
  conflictType: 'qualification' | 'scoring' | 'placement';
}

interface ResolutionDialogState {
  isOpen: boolean;
  conflict: ConflictItem | null;
  selectedResolution: ConflictResolution['strategy'] | null;
  resolutionNotes: string;
  isSubmitting: boolean;
}

const CONFLICT_RESOLUTION_STRATEGIES = [
  {
    value: 'manual_override' as const,
    label: 'Manual Override',
    description: 'Head judge or show manager makes final decision'
  },
  {
    value: 'average' as const,
    label: 'Average Scores',
    description: 'Use mathematical average of all judge scores'
  },
  {
    value: 'judge_hierarchy' as const,
    label: 'Judge Hierarchy',
    description: 'Use score from highest-ranking judge'
  },
  {
    value: 'head_judge_final' as const,
    label: 'Head Judge Final',
    description: 'Head judge reviews and makes binding decision'
  },
  {
    value: 'disqualify' as const,
    label: 'Disqualify Entry',
    description: 'Remove entry due to irreconcilable differences'
  }
] as const;

/**
 * Scoring conflict handler for multi-judge scenarios
 */
export function ScoringConflictHandler({
  classId,
  format,
  onConflictResolved,
  onViewScore,
  className
}: ScoringConflictHandlerProps) {
  // Store hooks
  const { getScoresByClass } = useOfflineScoringStore();

  // Local state
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [resolutionDialog, setResolutionDialog] = useState<ResolutionDialogState>({
    isOpen: false,
    conflict: null,
    selectedResolution: null,
    resolutionNotes: '',
    isSubmitting: false
  });
  const [resolvedConflicts, setResolvedConflicts] = useState<Set<string>>(new Set());

  // Load and analyze conflicts
  const loadConflicts = useCallback(async () => {
    try {
      const scores = getScoresByClass(classId);
      
      // Group scores by entry
      const entryScores = new Map<string, BaseScore[]>();
      scores.forEach(score => {
        const existing = entryScores.get(score.entryId) || [];
        existing.push(score);
        entryScores.set(score.entryId, existing);
      });

      // Find conflicts (entries with multiple judges with different results)
      const conflictItems: ConflictItem[] = [];

      for (const [entryId, entryScoreList] of entryScores.entries()) {
        if (entryScoreList.length <= 1) continue;

        // Check for qualification conflicts
        const qualifications = entryScoreList.map(s => s.qualification);
        const uniqueQualifications = new Set(qualifications);

        if (uniqueQualifications.size > 1) {
          // Create multi-judge score structure
          const judgeScoresMap = new Map<string, BaseScore>();
          entryScoreList.forEach(score => {
            judgeScoresMap.set(score.judgeId, score);
          });

          const multiJudgeScore: MultiJudgeScore = {
            entryId,
            classId,
            format,
            judgeScores: judgeScoresMap,
            hasConflicts: true,
            lastUpdated: new Date(),
            syncStatus: 'pending'
          };

          // Determine conflict severity
          let severity: 'high' | 'medium' | 'low' = 'medium';
          if (qualifications.includes('Qualified') && qualifications.includes('Not Qualified')) {
            severity = 'high';
          } else if (qualifications.includes('Eliminated') || qualifications.includes('Excused')) {
            severity = 'high';
          }

          conflictItems.push({
            entryId,
            dogName: `Dog ${entryId.slice(-3)}`, // Mock data - would come from entry metadata
            handlerName: `Handler ${entryId.slice(-3)}`,
            armband: entryId.slice(-3),
            multiJudgeScore,
            severity,
            conflictType: 'qualification'
          });
        }
      }

      setConflicts(conflictItems);
    } catch (error) {
      logger.error('Failed to load conflicts:', 'scoring', {}, error as Error);
    }
  }, [classId, getScoresByClass, format]);

  // Load conflicts on mount and when data changes
  useEffect(() => {
    loadConflicts();

    // Listen for scoring events
    const handleScoringEvent = (event: unknown) => {
      const typedEvent = event as { classId?: string; entryId?: string };
      if (typedEvent?.classId === classId) {
        loadConflicts();
      }
    };

    offlineScoringService.on('multi_judge_score_updated', handleScoringEvent);

    return () => {
      offlineScoringService.off('multi_judge_score_updated', handleScoringEvent);
    };
  }, [classId, loadConflicts]);

  // Filter unresolved conflicts
  const unresolvedConflicts = useMemo(() => 
    conflicts.filter(c => !resolvedConflicts.has(c.entryId)),
    [conflicts, resolvedConflicts]
  );

  // Handle resolution dialog
  const openResolutionDialog = useCallback((conflict: ConflictItem) => {
    setResolutionDialog({
      isOpen: true,
      conflict,
      selectedResolution: null,
      resolutionNotes: '',
      isSubmitting: false
    });
  }, []);

  const closeResolutionDialog = useCallback(() => {
    setResolutionDialog({
      isOpen: false,
      conflict: null,
      selectedResolution: null,
      resolutionNotes: '',
      isSubmitting: false
    });
  }, []);

  // Submit resolution
  const submitResolution = useCallback(async () => {
    if (!resolutionDialog.conflict || !resolutionDialog.selectedResolution) return;

    setResolutionDialog(prev => ({ ...prev, isSubmitting: true }));

    try {
      const resolution: ConflictResolution = {
        strategy: resolutionDialog.selectedResolution,
        resolvedBy: 'head_judge', // Would come from current user context
        resolvedAt: new Date(),
        resolutionNotes: resolutionDialog.resolutionNotes || 'Manual resolution applied'
      };

      // Mark conflict as resolved
      setResolvedConflicts(prev => new Set([...prev, resolutionDialog.conflict!.entryId]));

      // Notify parent
      onConflictResolved?.(resolutionDialog.conflict.entryId, resolution);

      closeResolutionDialog();
    } catch (error) {
      logger.error('Failed to submit resolution:', 'scoring', {}, error as Error);
    } finally {
      setResolutionDialog(prev => ({ ...prev, isSubmitting: false }));
    }
  }, [resolutionDialog, onConflictResolved, closeResolutionDialog]);

  // Get severity styling
  const getSeverityStyling = (severity: 'high' | 'medium' | 'low') => {
    switch (severity) {
      case 'high':
        return 'bg-error-red/10 text-error-red border-error-red/20';
      case 'medium':
        return 'bg-warning-orange/10 text-warning-orange border-warning-orange/20';
      case 'low':
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  // Get qualification status styling
  const getQualificationStyling = (qualification: QualificationStatus) => {
    switch (qualification) {
      case 'Qualified':
        return 'bg-success-green/10 text-success-green border-success-green/20';
      case 'Not Qualified':
        return 'bg-error-red/10 text-error-red border-error-red/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  // Format score display
  const formatScore = (score: BaseScore) => {
    switch (format) {
      case 'scent_work': {
        // Handle scent work score display
        const time = score.time || 0;
        return `${(time / 1000).toFixed(2)}s`;
      }
      case 'agility': {
        // Handle agility score display
        const time = score.time || 0;
        const faults = score.faults || 0;
        return `${(time / 1000).toFixed(2)}s, ${faults}F`;
      }
      case 'obedience':
      case 'rally': {
        // Handle obedience/rally score display
        const points = score.points || 0;
        return `${points} pts`;
      }
      default:
        return 'Score';
    }
  };

  if (unresolvedConflicts.length === 0) {
    return (
      <Card className={cn("bg-card/95 backdrop-blur-sm border-border/50", className)}>
        <CardContent className="p-6 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-success-green" />
          <h3 className="text-lg font-semibold mb-2">No Conflicts</h3>
          <p className="text-sm text-muted-foreground">
            All judge scores are in agreement
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <Card className="bg-card/95 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-warning-orange" />
              <CardTitle className="text-lg">Scoring Conflicts</CardTitle>
            </div>
            <Badge variant="destructive" className="text-xs">
              {unresolvedConflicts.length} conflicts
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Conflict list */}
      <ScrollArea className="h-96">
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {unresolvedConflicts.map((conflict, index) => (
              <motion.div
                key={conflict.entryId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ 
                  duration: 0.3,
                  delay: index * 0.05,
                  ease: [0.25, 0.46, 0.45, 0.94]
                }}
              >
                <Card className="bg-background/50 border-border/50 hover:bg-accent/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-foreground">
                              {conflict.dogName}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              #{conflict.armband}
                            </Badge>
                            <Badge 
                              variant="outline" 
                              className={cn("text-xs", getSeverityStyling(conflict.severity))}
                            >
                              {conflict.severity} priority
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            {conflict.handlerName}
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => openResolutionDialog(conflict)}
                        className="bg-primary hover:bg-primary/90"
                      >
                        <Gavel className="h-3 w-3 mr-1" />
                        Resolve
                      </Button>
                    </div>

                    <Separator className="my-3" />

                    {/* Judge scores comparison */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Judge Scores</span>
                      </div>

                      <div className="grid gap-2">
                        {Array.from(conflict.multiJudgeScore.judgeScores.entries()).map(([judgeId, score]) => (
                          <div 
                            key={judgeId}
                            className="flex items-center justify-between p-2 rounded bg-background/70 border border-border/30"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                Judge {judgeId.slice(-3)}
                              </span>
                              <Badge 
                                variant="outline" 
                                className={cn("text-xs", getQualificationStyling(score.qualification))}
                              >
                                {score.qualification === 'Qualified' ? 'Q' :
                                 score.qualification === 'Not Qualified' ? 'NQ' :
                                 score.qualification.charAt(0)}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono">
                                {formatScore(score)}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onViewScore?.(conflict.entryId, judgeId)}
                                className="h-6 px-2"
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Conflict details */}
                    <Alert className="mt-3 bg-warning-orange/5 border-warning-orange/20">
                      <Info className="h-4 w-4 text-warning-orange" />
                      <AlertDescription className="text-xs">
                        <strong>Conflict:</strong> Judges disagree on qualification status. 
                        Resolution required before final placements.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Resolution Dialog */}
      <Dialog open={resolutionDialog.isOpen} onOpenChange={closeResolutionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Resolve Scoring Conflict
            </DialogTitle>
          </DialogHeader>

          {resolutionDialog.conflict && (
            <div className="space-y-6">
              {/* Conflict summary */}
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">
                    {resolutionDialog.conflict.dogName} (#{resolutionDialog.conflict.armband})
                  </span>
                  <Badge 
                    variant="outline" 
                    className={cn("text-xs", getSeverityStyling(resolutionDialog.conflict.severity))}
                  >
                    {resolutionDialog.conflict.severity} priority
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Handler: {resolutionDialog.conflict.handlerName}
                </p>
              </div>

              {/* Resolution strategy selection */}
              <div className="space-y-3">
                <Label htmlFor="resolution-strategy" className="text-sm font-medium">
                  Resolution Strategy
                </Label>
                <Select
                  value={resolutionDialog.selectedResolution || ''}
                  onValueChange={(value) => 
                    setResolutionDialog(prev => ({ 
                      ...prev, 
                      selectedResolution: value as ConflictResolution['strategy']
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select resolution method" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFLICT_RESOLUTION_STRATEGIES.map((strategy) => (
                      <SelectItem key={strategy.value} value={strategy.value}>
                        <div>
                          <div className="font-medium">{strategy.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {strategy.description}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Resolution notes */}
              <div className="space-y-3">
                <Label htmlFor="resolution-notes" className="text-sm font-medium">
                  Resolution Notes
                </Label>
                <Textarea
                  id="resolution-notes"
                  placeholder="Enter notes about this resolution decision..."
                  value={resolutionDialog.resolutionNotes}
                  onChange={(e) => 
                    setResolutionDialog(prev => ({ 
                      ...prev, 
                      resolutionNotes: e.target.value 
                    }))
                  }
                  rows={3}
                />
              </div>

              {/* Preview final decision */}
              {resolutionDialog.selectedResolution && (
                <Alert className="bg-primary/5 border-primary/20">
                  <ArrowRight className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-sm">
                    <strong>Final Decision:</strong> {
                      CONFLICT_RESOLUTION_STRATEGIES.find(s => s.value === resolutionDialog.selectedResolution)?.description
                    }
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeResolutionDialog}>
              Cancel
            </Button>
            <Button
              onClick={submitResolution}
              disabled={!resolutionDialog.selectedResolution || resolutionDialog.isSubmitting}
              className="bg-primary hover:bg-primary/90"
            >
              {resolutionDialog.isSubmitting ? (
                <>
                  <Clock className="h-3 w-3 mr-2 animate-spin" />
                  Resolving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-2" />
                  Apply Resolution
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ScoringConflictHandler;