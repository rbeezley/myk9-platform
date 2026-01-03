import { useState, useEffect, useCallback, useRef } from 'react';
import { RealtimeScoringService } from '@/services/realtime/RealtimeScoringService';
import { Score, ScoreUpdate, JudgePresence, PlacementUpdate, ScoringConflict } from '@/types/scoring-types';

interface UseRealtimeScoringOptions {
  classId?: string;
  showId?: string;
  autoSubscribe?: boolean;
  enablePresence?: boolean;
}

interface UseRealtimeScoringReturn {
  // Connection state
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  
  // Judges presence
  activeJudges: JudgePresence[];
  isJudgeActive: (judgeId: string) => boolean;
  
  // Scores
  realtimeScores: Score[];
  latestScoreUpdate: ScoreUpdate | null;
  
  // Placements
  currentPlacements: PlacementUpdate | null;
  
  // Conflicts
  activeConflicts: ScoringConflict[];
  
  // Actions
  submitScore: (score: Omit<Score, 'id' | 'created_at' | 'updated_at'>) => Promise<Score>;
  updateScore: (scoreId: string, updates: Partial<Score>) => Promise<Score>;
  deleteScore: (scoreId: string) => Promise<void>;
  updatePresence: (status: 'active' | 'idle' | 'offline') => Promise<void>;
  subscribeToClass: (classId: string, showId: string) => Promise<void>;
  unsubscribeFromClass: (classId: string) => Promise<void>;
  resolveConflict: (conflictId: string, resolution: 'accept_local' | 'accept_remote' | 'merge') => Promise<void>;
  
  // Event handlers
  onScoreUpdate: (callback: (update: ScoreUpdate) => void) => () => void;
  onPlacementUpdate: (callback: (update: PlacementUpdate) => void) => () => void;
  onConflictDetected: (callback: (conflict: ScoringConflict) => void) => () => void;
  onJudgeActivity: (callback: (activity: JudgePresence) => void) => () => void;
}

export function useRealtimeScoring(options: UseRealtimeScoringOptions = {}): UseRealtimeScoringReturn {
  const {
    classId,
    showId,
    autoSubscribe = true,
    enablePresence = true
  } = options;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [activeJudges, setActiveJudges] = useState<JudgePresence[]>([]);
  const [realtimeScores, setRealtimeScores] = useState<Score[]>([]);
  const [latestScoreUpdate, setLatestScoreUpdate] = useState<ScoreUpdate | null>(null);
  const [currentPlacements, setCurrentPlacements] = useState<PlacementUpdate | null>(null);
  const [activeConflicts, setActiveConflicts] = useState<ScoringConflict[]>([]);

  // Service reference
  const serviceRef = useRef<RealtimeScoringService>();
  const unsubscribersRef = useRef<(() => void)[]>([]);

  // Get service instance
  useEffect(() => {
    serviceRef.current = RealtimeScoringService.getInstance();
  }, []);

  // Connection monitoring
  useEffect(() => {
    if (!serviceRef.current) return;

    const service = serviceRef.current;
    
    const unsubscribeConnection = service.subscribe('connection-restored', () => {
      setIsConnected(true);
      setConnectionStatus('connected');
    });

    const unsubscribeDisconnection = service.subscribe('connection-lost', () => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
    });

    const unsubscribeError = service.subscribe('connection-failed', () => {
      setConnectionStatus('error');
    });

    unsubscribersRef.current.push(
      unsubscribeConnection,
      unsubscribeDisconnection,
      unsubscribeError
    );

    return () => {
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
    };
  }, []);

  // Score updates subscription
  useEffect(() => {
    if (!serviceRef.current) return;

    const service = serviceRef.current;
    
    const unsubscribeScores = service.subscribe('score-update', (update: unknown) => {
      const scoreUpdate = update as ScoreUpdate;
      setLatestScoreUpdate(scoreUpdate);
      
      // Update scores list
      setRealtimeScores(prevScores => {
        const existingIndex = prevScores.findIndex(s => s.id === scoreUpdate.scoreId);
        
        if (scoreUpdate.changes && 'deleted' in scoreUpdate.changes) {
          return prevScores.filter(s => s.id !== scoreUpdate.scoreId);
        } else if (existingIndex >= 0) {
          // Update existing score
          const newScores = [...prevScores];
          newScores[existingIndex] = { ...newScores[existingIndex], ...scoreUpdate.changes };
          return newScores;
        } else {
          // Add new score - we'd need to get the full score from somewhere
          return prevScores;
        }
      });
    });

    unsubscribersRef.current.push(unsubscribeScores);

    return () => {
      unsubscribeScores();
    };
  }, []);

  // Placement updates subscription
  useEffect(() => {
    if (!serviceRef.current) return;

    const service = serviceRef.current;
    
    const unsubscribePlacements = service.subscribe('placement-update', (update: unknown) => {
      const placementUpdate = update as PlacementUpdate;
      setCurrentPlacements(placementUpdate);
    });

    unsubscribersRef.current.push(unsubscribePlacements);

    return () => {
      unsubscribePlacements();
    };
  }, []);

  // Presence updates subscription
  useEffect(() => {
    if (!serviceRef.current || !enablePresence) return;

    const service = serviceRef.current;
    
    const unsubscribePresence = service.subscribe('presence-sync', (judges: unknown) => {
      const judgesList = judges as JudgePresence[];
      setActiveJudges(judgesList);
    });

    const unsubscribeJudgeJoined = service.subscribe('judge-joined', (judge: unknown) => {
      const judgePresence = judge as JudgePresence;
      setActiveJudges(prev => {
        const existing = prev.find(j => j.judgeId === judgePresence.judgeId);
        if (existing) {
          return prev.map(j => j.judgeId === judgePresence.judgeId ? judgePresence : j);
        }
        return [...prev, judgePresence];
      });
    });

    const unsubscribeJudgeLeft = service.subscribe('judge-left', (data: unknown) => {
      const { judgeId } = data as { judgeId: string };
      setActiveJudges(prev => prev.filter(j => j.judgeId !== judgeId));
    });

    unsubscribersRef.current.push(
      unsubscribePresence,
      unsubscribeJudgeJoined,
      unsubscribeJudgeLeft
    );

    return () => {
      unsubscribePresence();
      unsubscribeJudgeJoined();
      unsubscribeJudgeLeft();
    };
  }, [enablePresence]);

  // Conflict detection subscription
  useEffect(() => {
    if (!serviceRef.current) return;

    const service = serviceRef.current;
    
    const unsubscribeConflicts = service.subscribe('scoring-conflict', (conflict: unknown) => {
      const scoringConflict = conflict as ScoringConflict;
      setActiveConflicts(prev => {
        const existing = prev.find(c => c.id === scoringConflict.id);
        if (existing) {
          return prev.map(c => c.id === scoringConflict.id ? scoringConflict : c);
        }
        return [...prev, scoringConflict];
      });
    });

    const unsubscribeConflictResolved = service.subscribe('conflict-resolved', (data: unknown) => {
      const { conflictId } = data as { conflictId: string };
      setActiveConflicts(prev => prev.filter(c => c.id !== conflictId));
    });

    unsubscribersRef.current.push(
      unsubscribeConflicts,
      unsubscribeConflictResolved
    );

    return () => {
      unsubscribeConflicts();
      unsubscribeConflictResolved();
    };
  }, []);

  // Auto-subscribe to class
  useEffect(() => {
    if (autoSubscribe && classId && showId && serviceRef.current) {
      serviceRef.current.subscribeToClass();
    }

    return () => {
      if (classId && serviceRef.current) {
        serviceRef.current.unsubscribeFromClass(classId);
      }
    };
  }, [autoSubscribe, classId, showId]);

  // Actions
  const submitScore = useCallback(async (score: Omit<Score, 'id' | 'created_at' | 'updated_at'>) => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return serviceRef.current.submitScore(score);
  }, []);

  const updateScore = useCallback(async (scoreId: string, updates: Partial<Score>) => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return serviceRef.current.updateScore(scoreId, updates);
  }, []);

  const deleteScore = useCallback(async (scoreId: string) => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return serviceRef.current.deleteScore(scoreId);
  }, []);

  const updatePresence = useCallback(async (status: 'active' | 'idle' | 'offline') => {
    if (!serviceRef.current || !classId) return;
    
    // Get current user info (this would come from auth context)
    const currentUser = { id: 'current-judge', name: 'Current Judge' }; // TODO: Get from auth
    
    return serviceRef.current.updateJudgePresence(
      currentUser.id,
      currentUser.name,
      classId,
      status
    );
  }, [classId]);

  const subscribeToClass = useCallback(async () => {
    if (!serviceRef.current) return;
    return serviceRef.current.subscribeToClass();
  }, []);

  const unsubscribeFromClass = useCallback(async (classId: string) => {
    if (!serviceRef.current) return;
    return serviceRef.current.unsubscribeFromClass(classId);
  }, []);

  const isJudgeActive = useCallback((judgeId: string) => {
    if (!serviceRef.current) return false;
    return serviceRef.current.isJudgeActive(judgeId);
  }, []);

  const resolveConflict = useCallback(async (
    conflictId: string, 
    resolution: 'accept_local' | 'accept_remote' | 'merge'
  ) => {
    // This would integrate with ConflictResolver
    // Implementation depends on conflict resolution strategy
    console.log('Resolving conflict:', conflictId, resolution);
  }, []);

  // Event handlers
  const onScoreUpdate = useCallback((callback: (update: ScoreUpdate) => void) => {
    if (!serviceRef.current) return () => {};
    return serviceRef.current.subscribe('score-update', (data: unknown) => {
      callback(data as ScoreUpdate);
    });
  }, []);

  const onPlacementUpdate = useCallback((callback: (update: PlacementUpdate) => void) => {
    if (!serviceRef.current) return () => {};
    return serviceRef.current.subscribe('placement-update', (data: unknown) => {
      callback(data as PlacementUpdate);
    });
  }, []);

  const onConflictDetected = useCallback((callback: (conflict: ScoringConflict) => void) => {
    if (!serviceRef.current) return () => {};
    return serviceRef.current.subscribe('scoring-conflict', (data: unknown) => {
      callback(data as ScoringConflict);
    });
  }, []);

  const onJudgeActivity = useCallback((callback: (activity: JudgePresence) => void) => {
    if (!serviceRef.current) return () => {};
    const unsubscribeJoined = serviceRef.current.subscribe('judge-joined', (data: unknown) => {
      callback(data as JudgePresence);
    });
    const unsubscribeLeft = serviceRef.current.subscribe('judge-left', (data: unknown) => {
      const leftData = data as { judgeId: string; judgeName: string };
      callback({ ...leftData, status: 'offline' } as JudgePresence);
    });
    
    return () => {
      unsubscribeJoined();
      unsubscribeLeft();
    };
  }, []);

  return {
    // Connection state
    isConnected,
    connectionStatus,
    
    // Judges presence
    activeJudges,
    isJudgeActive,
    
    // Scores
    realtimeScores,
    latestScoreUpdate,
    
    // Placements
    currentPlacements,
    
    // Conflicts
    activeConflicts,
    
    // Actions
    submitScore,
    updateScore,
    deleteScore,
    updatePresence,
    subscribeToClass,
    unsubscribeFromClass,
    resolveConflict,
    
    // Event handlers
    onScoreUpdate,
    onPlacementUpdate,
    onConflictDetected,
    onJudgeActivity
  };
}