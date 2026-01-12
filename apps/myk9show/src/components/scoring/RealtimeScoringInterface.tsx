import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
import { logger } from '@/services/LoggingService';
  AlertTriangle, 
  Users, 
  Wifi, 
  WifiOff, 
  Clock, 
  Trophy,
  Eye,
} from 'lucide-react';
import { useRealtimeScoring } from '@/hooks/useRealtimeScoring';
import { Score } from '@/types/scoring-types';
import { cn } from '@/lib/utils';

interface RealtimeScoringInterfaceProps {
  classId: string;
  showId: string;
  judgeId: string;
  judgeName: string;
}

export function RealtimeScoringInterface({
  classId,
  showId,
  judgeId
}: RealtimeScoringInterfaceProps) {
  const {
    isConnected,
    connectionStatus,
    activeJudges,
    isJudgeActive,
    realtimeScores,
    latestScoreUpdate,
    currentPlacements,
    activeConflicts,
    submitScore,
    // updateScore,
    // deleteScore,
    updatePresence,
    onScoreUpdate,
    onPlacementUpdate,
    onConflictDetected
  } = useRealtimeScoring({
    classId,
    showId,
    autoSubscribe: true,
    enablePresence: true
  });

  const [currentScore, setCurrentScore] = useState({
    dogId: '',
    points: 0,
    time: 0,
    faults: 0,
    notes: ''
  });

  const [isScoring, setIsScoring] = useState(false);

  // Update presence on mount and status changes
  useEffect(() => {
    updatePresence('active');
    
    return () => {
      updatePresence('offline');
    };
  }, [updatePresence]);

  // Handle idle detection
  useEffect(() => {
    let idleTimer: NodeJS.Timeout;
    
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      if (isJudgeActive(judgeId)) {
        updatePresence('active');
      }
      
      idleTimer = setTimeout(() => {
        updatePresence('idle');
      }, 5 * 60 * 1000); // 5 minutes
    };

    // Events that reset idle timer
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetIdleTimer, true);
    });

    resetIdleTimer();

    return () => {
      clearTimeout(idleTimer);
      events.forEach(event => {
        document.removeEventListener(event, resetIdleTimer, true);
      });
    };
  }, [judgeId, isJudgeActive, updatePresence]);

  // Score update notifications
  useEffect(() => {
    const unsubscribe = onScoreUpdate((update) => {
      // Show notification for scores from other judges
      if (update.judgeId !== judgeId) {
        logger.debug('New score from another judge:', 'scoring', { data: update });
        // Could trigger toast notification here
      }
    });

    return unsubscribe;
  }, [onScoreUpdate, judgeId]);

  // Placement update notifications
  useEffect(() => {
    const unsubscribe = onPlacementUpdate((update) => {
      logger.debug('Placements updated:', 'scoring', { data: update });
      // Could trigger UI update animation here
    });

    return unsubscribe;
  }, [onPlacementUpdate]);

  // Conflict detection
  useEffect(() => {
    const unsubscribe = onConflictDetected((conflict) => {
      logger.debug('Scoring conflict detected:', 'scoring', { data: conflict });
      // Could show conflict resolution dialog here
    });

    return unsubscribe;
  }, [onConflictDetected]);

  const handleSubmitScore = async () => {
    if (!currentScore.dogId) return;

    setIsScoring(true);
    
    try {
      const score: Omit<Score, 'id' | 'created_at' | 'updated_at'> = {
        entryId: currentScore.dogId, // Using dogId as entryId for now
        classId: classId,
        showId: showId,
        dogId: currentScore.dogId,
        judgeId: judgeId,
        format: 'scent_work' as const, // Default format
        qualification: 'Qualified' as const, // Default qualification
        timestamp: new Date(),
        points: currentScore.points,
        time: currentScore.time,
        faults: currentScore.faults,
        judgeNotes: currentScore.notes,
        placement: 0, // Will be calculated server-side
        recordedBy: judgeId,
        recordedAt: new Date(),
        version: 1,
        lastModified: new Date(),
        syncStatus: 'pending'
      };

      await submitScore(score);
      
      // Reset form
      setCurrentScore({
        dogId: '',
        points: 0,
        time: 0,
        faults: 0,
        notes: ''
      });

    } catch (error) {
      logger.error('Failed to submit score:', 'scoring', {}, error as Error);
    } finally {
      setIsScoring(false);
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-500';
      case 'connecting': return 'text-yellow-500';
      case 'disconnected': return 'text-orange-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getConnectionStatusIcon = () => {
    return isConnected ? (
      <Wifi className="h-4 w-4" />
    ) : (
      <WifiOff className="h-4 w-4" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with connection status and active judges */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Live Scoring Interface</CardTitle>
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className={cn(
                "flex items-center space-x-2",
                getConnectionStatusColor()
              )}>
                {getConnectionStatusIcon()}
                <span className="text-sm font-medium capitalize">
                  {connectionStatus}
                </span>
              </div>
              
              {/* Active Judges */}
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="text-sm">
                  {activeJudges.length} active
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Active Judges List */}
          {activeJudges.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Active Judges</Label>
              <div className="flex flex-wrap gap-2">
                {activeJudges.map((judge) => (
                  <Badge
                    key={judge.judgeId}
                    variant={judge.status === 'online' ? 'default' : 'secondary'}
                    className="flex items-center space-x-1"
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      judge.status === 'online' ? 'bg-green-500' : 'bg-yellow-500'
                    )} />
                    <span>{judge.judgeName}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Conflicts Alert */}
          {activeConflicts.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center space-x-2 text-yellow-800">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">
                  {activeConflicts.length} scoring conflict{activeConflicts.length !== 1 ? 's' : ''} detected
                </span>
              </div>
              <p className="text-sm text-yellow-700 mt-1">
                Multiple judges have scored the same entry. Please review and resolve conflicts.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scoring Form */}
      <Card>
        <CardHeader>
          <CardTitle>Score Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dogId">Dog ID</Label>
              <Input
                id="dogId"
                value={currentScore.dogId}
                onChange={(e) => setCurrentScore(prev => ({ ...prev, dogId: e.target.value }))}
                placeholder="Enter dog ID"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="points">Points</Label>
              <Input
                id="points"
                type="number"
                value={currentScore.points}
                onChange={(e) => setCurrentScore(prev => ({ ...prev, points: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="time">Time (seconds)</Label>
              <Input
                id="time"
                type="number"
                step="0.01"
                value={currentScore.time}
                onChange={(e) => setCurrentScore(prev => ({ ...prev, time: Number(e.target.value) }))}
                placeholder="0.00"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="faults">Faults</Label>
              <Input
                id="faults"
                type="number"
                value={currentScore.faults}
                onChange={(e) => setCurrentScore(prev => ({ ...prev, faults: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={currentScore.notes}
              onChange={(e) => setCurrentScore(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional notes"
            />
          </div>
          
          <Button
            onClick={handleSubmitScore}
            disabled={!currentScore.dogId || isScoring || !isConnected}
            className="w-full"
          >
            {isScoring ? 'Submitting...' : 'Submit Score'}
          </Button>
        </CardContent>
      </Card>

      {/* Live Scores */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Live Scores</CardTitle>
            {latestScoreUpdate && (
              <Badge variant="outline" className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span className="text-xs">
                  Updated {new Date(latestScoreUpdate.timestamp).toLocaleTimeString()}
                </span>
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            {realtimeScores.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No scores yet</p>
                <p className="text-sm">Scores will appear here in real-time</p>
              </div>
            ) : (
              <div className="space-y-2">
                {realtimeScores
                  .sort((a, b) => ((b.points || 0) - (b.faults || 0)) - ((a.points || 0) - (a.faults || 0)))
                  .map((score, index) => (
                    <div
                      key={score.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        score.judgeId === judgeId ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">Dog {score.dogId}</p>
                          <p className="text-sm text-muted-foreground">
                            Judge: {score.judgeId === judgeId ? 'You' : score.judgeId}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold">
                            {(score.points || 0) - (score.faults || 0)} pts
                          </span>
                          {score.placement && score.placement <= 3 && (
                            <Trophy className={cn(
                              "h-4 w-4",
                              score.placement === 1 ? 'text-yellow-500' :
                              score.placement === 2 ? 'text-gray-400' :
                              'text-amber-600'
                            )} />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {score.time || 0}s, {score.faults || 0} faults
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Latest Placement Update */}
      {currentPlacements && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Trophy className="h-5 w-5" />
              <span>Latest Placement Update</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-2">
              Last updated: {new Date(currentPlacements.timestamp).toLocaleTimeString()}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded border">
                <div className="flex items-center space-x-3">
                  <Badge variant={currentPlacements.newPlacement <= 3 ? 'default' : 'secondary'}>
                    #{currentPlacements.newPlacement}
                  </Badge>
                  <span>Entry {currentPlacements.entryId}</span>
                </div>
                <div className="text-right">
                  {currentPlacements.previousPlacement && (
                    <div className="text-sm text-muted-foreground">
                      Previous: #{currentPlacements.previousPlacement}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}