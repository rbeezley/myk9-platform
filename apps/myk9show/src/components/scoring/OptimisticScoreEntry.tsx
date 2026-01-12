import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useOptimisticScores } from '@/hooks/useOptimisticUI';
// import { updateOptimisticScore } from '@/utils/optimisticHelpers';
import { SaveIndicator } from '@/components/optimistic/OptimisticUpdateIndicator';
import { ScoreUpdatedToast } from '@/components/optimistic/UndoToast';
import { useOptimisticNotifications } from '@/utils/optimisticUtils';
import { logger } from '@/services/LoggingService';

interface OptimisticScoreEntryProps {
  entryId: string;
  dogName: string;
  entryNumber: string;
  currentScore?: number;
  maxScore: number;
  onScoreUpdate: (score: number) => Promise<unknown>;
  disabled?: boolean;
  className?: string;
}

export const OptimisticScoreEntry: React.FC<OptimisticScoreEntryProps> = ({
  entryId,
  dogName,
  entryNumber,
  currentScore = 0,
  maxScore = 100,
  onScoreUpdate,
  disabled = false,
  className
}) => {
  const [score, setScore] = useState(currentScore.toString());
  const [previousScore, setPreviousScore] = useState(currentScore);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);

  const { addUndoAction } = useOptimisticNotifications();

  const {
    optimisticUpdate,
    isProcessing,
    lastOperationId,
    getOperationStatus,
    undo
  } = useOptimisticScores({
    onSuccess: () => {
      setLastSaveTime(new Date());
      setPreviousScore(parseFloat(score));
      
      // Show undo option for score changes
      if (previousScore !== parseFloat(score)) {
        setShowUndoToast(true);
        addUndoAction(
          `Score changed from ${previousScore} to ${score}`,
          async () => {
            setScore(previousScore.toString());
            await handleScoreSubmit(previousScore);
          }
        );
        
        // Auto-hide undo toast after 5 seconds
        setTimeout(() => setShowUndoToast(false), 5000);
      }
    },
    onError: () => {
      // Revert to previous score on error
      setScore(previousScore.toString());
    },
    onRollback: () => {
      setScore(previousScore.toString());
    }
  });

  const handleScoreSubmit = useCallback(async (scoreValue: number) => {
    if (scoreValue < 0 || scoreValue > maxScore) {
      return;
    }

    try {
      await optimisticUpdate(
        entryId,
        { score: scoreValue, updatedAt: new Date() },
        () => onScoreUpdate(scoreValue)
      );
    } catch (error) {
      logger.error('Failed to update score:', 'scoring', {}, error as Error);
    }
  }, [entryId, maxScore, optimisticUpdate, onScoreUpdate]);

  // Auto-save after user stops typing
  useEffect(() => {
    const scoreValue = parseFloat(score);
    if (isNaN(scoreValue) || scoreValue === previousScore || disabled) return;

    const autoSaveTimer = setTimeout(() => {
      handleScoreSubmit(scoreValue);
    }, 1500); // 1.5 second delay

    return () => clearTimeout(autoSaveTimer);
  }, [score, previousScore, disabled, handleScoreSubmit]);

  const handleScoreChange = (value: string) => {
    setScore(value);
  };

  const handleManualSave = () => {
    const scoreValue = parseFloat(score);
    if (!isNaN(scoreValue)) {
      handleScoreSubmit(scoreValue);
    }
  };

  const handleUndo = async () => {
    await undo();
    setShowUndoToast(false);
  };

  const isValidScore = () => {
    const scoreValue = parseFloat(score);
    return !isNaN(scoreValue) && scoreValue >= 0 && scoreValue <= maxScore;
  };

  const getScoreStatus = () => {
    if (isProcessing) return 'saving';
    if (lastOperationId) {
      const status = getOperationStatus(lastOperationId);
      return status || 'idle';
    }
    return 'idle';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'saving':
      case 'pending':
        return 'text-blue-500';
      case 'confirmed':
        return 'text-green-500';
      case 'failed':
      case 'rolled_back':
        return 'text-red-500';
      case 'retrying':
        return 'text-orange-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'saving':
      case 'pending':
        return <Clock className="w-3 h-3 animate-pulse" />;
      case 'confirmed':
        return <CheckCircle className="w-3 h-3" />;
      case 'failed':
      case 'rolled_back':
        return <AlertTriangle className="w-3 h-3" />;
      case 'retrying':
        return <Clock className="w-3 h-3 animate-spin" />;
      default:
        return null;
    }
  };

  const status = getScoreStatus();
  const hasChanged = parseFloat(score) !== previousScore;

  return (
    <>
      <Card className={cn('relative transition-all duration-200', className)}>
        {isProcessing && lastOperationId && <SaveIndicator operationId={lastOperationId} />}
        
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">{dogName}</CardTitle>
              <p className="text-xs text-muted-foreground">Entry #{entryNumber}</p>
            </div>
            
            <div className="flex items-center gap-2">
              {lastSaveTime && (
                <Badge variant="secondary" className="text-xs">
                  Saved {lastSaveTime.toLocaleTimeString()}
                </Badge>
              )}
              
              <div className={cn('flex items-center gap-1 text-xs', getStatusColor(status))}>
                {getStatusIcon(status)}
                <span className="capitalize">{status === 'confirmed' ? 'saved' : status}</span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Score</label>
              <span className="text-xs text-muted-foreground">Max: {maxScore}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={score}
                onChange={(e) => handleScoreChange(e.target.value)}
                placeholder="Enter score"
                min="0"
                max={maxScore}
                step="0.1"
                disabled={disabled || isProcessing}
                className={cn(
                  'text-center text-lg font-semibold',
                  !isValidScore() && 'border-red-500',
                  hasChanged && 'border-blue-500'
                )}
              />
              
              {hasChanged && !isProcessing && (
                <Button
                  size="sm"
                  onClick={handleManualSave}
                  disabled={!isValidScore()}
                  className="shrink-0"
                >
                  <Save className="w-3 h-3" />
                </Button>
              )}
            </div>
            
            {!isValidScore() && (
              <p className="text-xs text-red-500">
                Score must be between 0 and {maxScore}
              </p>
            )}
          </div>

          {/* Score visualization */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{isValidScore() ? `${((parseFloat(score) / maxScore) * 100).toFixed(1)}%` : '0%'}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <motion.div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                initial={{ width: `${(previousScore / maxScore) * 100}%` }}
                animate={{ 
                  width: isValidScore() ? `${(parseFloat(score) / maxScore) * 100}%` : '0%' 
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* Auto-save indicator */}
          <AnimatePresence>
            {hasChanged && !isProcessing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-muted-foreground text-center"
              >
                Will save automatically in 1.5s...
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Undo toast */}
      {showUndoToast && (
        <ScoreUpdatedToast
          previousScore={previousScore}
          newScore={parseFloat(score)}
          undoAction={handleUndo}
        />
      )}
    </>
  );
};

// Bulk score entry component
export const OptimisticBulkScoreEntry: React.FC<{
  entries: Array<{
    id: string;
    dogName: string;
    entryNumber: string;
    currentScore?: number;
  }>;
  maxScore: number;
  onBulkUpdate: (scores: Array<{ entryId: string; score: number }>) => Promise<void>;
}> = ({ entries, maxScore, onBulkUpdate }) => {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { showSuccess } = useOptimisticNotifications();

  const updateScore = (entryId: string, score: number) => {
    setScores(prev => ({ ...prev, [entryId]: score }));
  };

  const handleBulkSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      const scoreUpdates = Object.entries(scores).map(([entryId, score]) => ({
        entryId,
        score
      }));

      await onBulkUpdate(scoreUpdates);
      
      showSuccess(`Updated ${scoreUpdates.length} scores successfully`);
      setScores({});
    } catch (error) {
      logger.error('Bulk score update failed:', 'scoring', {}, error as Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges = Object.keys(scores).length > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {entries.map(entry => (
          <OptimisticScoreEntry
            key={entry.id}
            entryId={entry.id}
            dogName={entry.dogName}
            entryNumber={entry.entryNumber}
            currentScore={entry.currentScore}
            maxScore={maxScore}
            onScoreUpdate={async (score) => {
              updateScore(entry.id, score);
              return Promise.resolve();
            }}
            disabled={isSubmitting}
          />
        ))}
      </div>

      {hasChanges && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={handleBulkSubmit}
            disabled={isSubmitting}
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Clock className="w-4 h-4 mr-2 animate-spin" />
                Saving {Object.keys(scores).length} scores...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save All Changes ({Object.keys(scores).length})
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};