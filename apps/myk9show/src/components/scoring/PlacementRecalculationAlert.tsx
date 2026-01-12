/**
 * Placement Recalculation Alert Component
 * 
 * Displays alerts for placement changes and recalculation events.
 * Provides clear notifications of ranking updates with smooth animations
 * and Apple-inspired design for professional competition management.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// UI Components
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
// import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
import { logger } from '@/services/LoggingService';
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';

// Icons
import { 
  TrendingUp, 
  TrendingDown, 
  Trophy, 
  AlertTriangle, 
 
  X, 
  ArrowUp, 
  ArrowDown, 
  RotateCcw,
  Clock,
  CheckCircle2,
  Zap
} from 'lucide-react';

// Hooks and Services
import { useOfflineScoringStore } from '@/store/offlineScoringStore';
import { placementCalculatorService } from '@/services/scoring/PlacementCalculatorService';

// Types
import type { 
  PlacementEntry, 
 
  ScoringFormat 
} from '@/types/scoring-types';

export interface PlacementRecalculationAlertProps {
  classId: string;
  format: ScoringFormat;
  onDismiss?: (alertId: string) => void;
  onViewPlacements?: () => void;
  maxAlerts?: number;
  autoHideDelay?: number; // ms
  className?: string;
}

interface PlacementChange {
  entryId: string;
  dogName: string;
  handlerName: string;
  armband: string;
  oldPlacement?: number;
  newPlacement?: number;
  changeType: 'gained' | 'lost' | 'moved_up' | 'moved_down' | 'new_entry';
  timestamp: Date;
}

interface PlacementAlert {
  id: string;
  type: 'recalculation' | 'conflict_resolved' | 'major_change' | 'new_scores';
  title: string;
  message: string;
  changes: PlacementChange[];
  timestamp: Date;
  priority: 'high' | 'medium' | 'low';
  isDismissed: boolean;
  autoHide: boolean;
}

/**
 * Placement recalculation alert system
 */
export function PlacementRecalculationAlert({
  classId,
  format,
  onDismiss,
  onViewPlacements,
  maxAlerts = 5,
  autoHideDelay = 10000,
  className
}: PlacementRecalculationAlertProps) {
  // Store hooks
  const { getScoresByClass } = useOfflineScoringStore();

  // Local state
  const [alerts, setAlerts] = useState<PlacementAlert[]>([]);
  const [currentPlacements, setCurrentPlacements] = useState<PlacementEntry[]>([]);
  const [previousPlacements, setPreviousPlacements] = useState<Map<string, number>>(new Map());
  // const [lastCalculationTime, setLastCalculationTime] = useState<Date | null>(null);

  // Generate unique alert ID
  const generateAlertId = () => `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Calculate placement changes
  const calculatePlacementChanges = useCallback(
    (newPlacements: PlacementEntry[]): PlacementChange[] => {
      const changes: PlacementChange[] = [];

      newPlacements.forEach(entry => {
        if (!entry.placement) return;

        const oldPlacement = previousPlacements.get(entry.entryId);
        
        if (oldPlacement === undefined) {
          // New entry
          changes.push({
            entryId: entry.entryId,
            dogName: entry.dogName,
            handlerName: entry.handlerName,
            armband: entry.armband,
            newPlacement: entry.placement,
            changeType: 'new_entry',
            timestamp: new Date()
          });
        } else if (oldPlacement !== entry.placement) {
          // Placement changed
          const changeType = entry.placement < oldPlacement ? 'moved_up' : 'moved_down';
          
          changes.push({
            entryId: entry.entryId,
            dogName: entry.dogName,
            handlerName: entry.handlerName,
            armband: entry.armband,
            oldPlacement,
            newPlacement: entry.placement,
            changeType,
            timestamp: new Date()
          });
        }
      });

      // Check for entries that lost placement (removed from placements)
      for (const [entryId, oldPlacement] of previousPlacements.entries()) {
        const stillPlaced = newPlacements.find(p => p.entryId === entryId && p.placement);
        if (!stillPlaced) {
          const entryInfo = currentPlacements.find(p => p.entryId === entryId);
          if (entryInfo) {
            changes.push({
              entryId,
              dogName: entryInfo.dogName,
              handlerName: entryInfo.handlerName,
              armband: entryInfo.armband,
              oldPlacement,
              changeType: 'lost',
              timestamp: new Date()
            });
          }
        }
      }

      return changes;
    },
    [previousPlacements, currentPlacements]
  );

  // Create alert from changes
  const createAlertFromChanges = useCallback(
    (changes: PlacementChange[], triggerType: 'score_update' | 'conflict_resolution' = 'score_update'): PlacementAlert | null => {
      if (changes.length === 0) return null;

      let type: PlacementAlert['type'] = 'recalculation';
      let priority: PlacementAlert['priority'] = 'medium';
      let title = 'Placements Updated';
      let message = `${changes.length} placement ${changes.length === 1 ? 'change' : 'changes'} detected`;

      // Determine alert type and priority
      const majorChanges = changes.filter(c => 
        c.changeType === 'moved_up' || c.changeType === 'moved_down'
      );
      const topThreeChanges = changes.filter(c => 
        (c.newPlacement && c.newPlacement <= 3) || (c.oldPlacement && c.oldPlacement <= 3)
      );

      if (triggerType === 'conflict_resolution') {
        type = 'conflict_resolved';
        priority = 'high';
        title = 'Conflict Resolved';
        message = 'Judge conflict resolved, placements recalculated';
      } else if (topThreeChanges.length > 0) {
        type = 'major_change';
        priority = 'high';
        title = 'Top Placements Changed';
        message = `Changes in top ${topThreeChanges.length === 1 ? 'placement' : 'placements'}`;
      } else if (majorChanges.length > 3) {
        priority = 'high';
        title = 'Major Placement Changes';
        message = `${majorChanges.length} entries changed position`;
      } else if (changes.some(c => c.changeType === 'new_entry')) {
        type = 'new_scores';
        title = 'New Scores Added';
        message = `${changes.filter(c => c.changeType === 'new_entry').length} new ${changes.filter(c => c.changeType === 'new_entry').length === 1 ? 'entry' : 'entries'} placed`;
      }

      return {
        id: generateAlertId(),
        type,
        title,
        message,
        changes,
        timestamp: new Date(),
        priority,
        isDismissed: false,
        autoHide: priority !== 'high'
      };
    },
    []
  );

  // Monitor placement changes
  const monitorPlacements = useCallback(async () => {
    try {
      const scores = getScoresByClass(classId);
      if (scores.length === 0) return;

      const calculation = await placementCalculatorService.calculatePlacements(
        classId,
        format,
        scores
      );

      const newPlacements = calculation.placements;
      const changes = calculatePlacementChanges(newPlacements);

      if (changes.length > 0) {
        const alert = createAlertFromChanges(changes);
        if (alert) {
          setAlerts(prev => {
            const updated = [alert, ...prev.filter(a => !a.isDismissed)];
            return updated.slice(0, maxAlerts);
          });
        }
      }

      // Update current placements and tracking
      setCurrentPlacements(newPlacements);
      const placementMap = new Map<string, number>();
      newPlacements.forEach(entry => {
        if (entry.placement) {
          placementMap.set(entry.entryId, entry.placement);
        }
      });
      setPreviousPlacements(placementMap);
      // setLastCalculationTime(calculation.calculatedAt);

    } catch (error) {
      logger.error('Failed to monitor placements:', 'scoring', {}, error as Error);
    }
  }, [classId, format, getScoresByClass, calculatePlacementChanges, createAlertFromChanges, maxAlerts]);

  // Auto-hide alerts
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    alerts.forEach(alert => {
      if (alert.autoHide && !alert.isDismissed) {
        const timer = setTimeout(() => {
          setAlerts(prev => prev.map(a => 
            a.id === alert.id ? { ...a, isDismissed: true } : a
          ));
        }, autoHideDelay);
        timers.push(timer);
      }
    });

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [alerts, autoHideDelay]);

  // Monitor scoring events
  useEffect(() => {
    monitorPlacements();

    // Listen for placement calculation events
    const handlePlacementCalculated = () => {
      monitorPlacements();
    };

    placementCalculatorService.on('placements_calculated', handlePlacementCalculated);

    return () => {
      placementCalculatorService.off('placements_calculated', handlePlacementCalculated);
    };
  }, [monitorPlacements]);

  // Dismiss alert
  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, isDismissed: true } : alert
    ));
    onDismiss?.(alertId);
  }, [onDismiss]);

  // Get visible alerts
  const visibleAlerts = useMemo(() => 
    alerts.filter(alert => !alert.isDismissed),
    [alerts]
  );

  // Get alert styling
  const getAlertStyling = (alert: PlacementAlert) => {
    switch (alert.priority) {
      case 'high':
        return {
          cardClass: 'border-warning-orange/50 bg-warning-orange/5',
          iconColor: 'text-warning-orange',
          badgeClass: 'bg-warning-orange/10 text-warning-orange border-warning-orange/20'
        };
      case 'medium':
        return {
          cardClass: 'border-primary/50 bg-primary/5',
          iconColor: 'text-primary',
          badgeClass: 'bg-primary/10 text-primary border-primary/20'
        };
      case 'low':
        return {
          cardClass: 'border-border/50 bg-background/5',
          iconColor: 'text-muted-foreground',
          badgeClass: 'bg-muted text-muted-foreground border-border'
        };
    }
  };

  // Get change icon
  const getChangeIcon = (changeType: PlacementChange['changeType']) => {
    switch (changeType) {
      case 'moved_up':
        return <ArrowUp className="h-3 w-3 text-success-green" />;
      case 'moved_down':
        return <ArrowDown className="h-3 w-3 text-error-red" />;
      case 'new_entry':
        return <TrendingUp className="h-3 w-3 text-primary" />;
      case 'lost':
        return <TrendingDown className="h-3 w-3 text-error-red" />;
      case 'gained':
        return <Trophy className="h-3 w-3 text-success-green" />;
      default:
        return <RotateCcw className="h-3 w-3 text-muted-foreground" />;
    }
  };

  // Format placement text
  const formatPlacementChange = (change: PlacementChange): string => {
    switch (change.changeType) {
      case 'moved_up':
        return `${change.oldPlacement} → ${change.newPlacement}`;
      case 'moved_down':
        return `${change.oldPlacement} → ${change.newPlacement}`;
      case 'new_entry':
        return `New ${change.newPlacement ? `#${change.newPlacement}` : 'entry'}`;
      case 'lost':
        return `Lost #${change.oldPlacement}`;
      case 'gained':
        return `Gained #${change.newPlacement}`;
      default:
        return 'Changed';
    }
  };

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <AnimatePresence mode="popLayout">
        {visibleAlerts.map((alert, index) => {
          const styling = getAlertStyling(alert);
          
          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              transition={{ 
                duration: 0.3,
                delay: index * 0.05,
                ease: [0.25, 0.46, 0.45, 0.94]
              }}
            >
              <Card className={cn(
                "backdrop-blur-sm shadow-lg transition-all duration-300",
                styling.cardClass
              )}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-1", styling.iconColor)}>
                        {alert.type === 'major_change' && <AlertTriangle className="h-4 w-4" />}
                        {alert.type === 'recalculation' && <RotateCcw className="h-4 w-4" />}
                        {alert.type === 'conflict_resolved' && <CheckCircle2 className="h-4 w-4" />}
                        {alert.type === 'new_scores' && <Zap className="h-4 w-4" />}
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-semibold text-foreground">
                            {alert.title}
                          </h4>
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs", styling.badgeClass)}
                          >
                            {alert.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {alert.message}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {alert.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {onViewPlacements && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={onViewPlacements}
                                className="h-7 w-7 p-0"
                              >
                                <Trophy className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>View placements</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => dismissAlert(alert.id)}
                              className="h-7 w-7 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Dismiss</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  {alert.changes.length > 0 && (
                    <>
                      <Separator className="mb-3" />
                      <ScrollArea className="max-h-32">
                        <div className="space-y-1">
                          {alert.changes.slice(0, 5).map((change, changeIndex) => (
                            <motion.div
                              key={`${change.entryId}-${changeIndex}`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: changeIndex * 0.05 }}
                              className="flex items-center justify-between p-2 rounded bg-background/50 border border-border/20"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {getChangeIcon(change.changeType)}
                                <span className="text-xs font-medium truncate">
                                  {change.dogName}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  #{change.armband}
                                </Badge>
                              </div>
                              <span className="text-xs font-mono">
                                {formatPlacementChange(change)}
                              </span>
                            </motion.div>
                          ))}
                          
                          {alert.changes.length > 5 && (
                            <div className="text-xs text-muted-foreground text-center py-1">
                              +{alert.changes.length - 5} more changes
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default PlacementRecalculationAlert;