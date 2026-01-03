import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Trophy, 
  Timer, 
  CheckCircle, 
  Save,
  Send,
  Eye,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Competitor {
  id: string;
  dogName: string;
  ownerName: string;
  breed: string;
  armband: string;
  photo?: string;
}

interface ScoringCriteria {
  id: string;
  name: string;
  maxPoints: number;
  description?: string;
}

interface Score {
  criteriaId: string;
  points: number;
  notes?: string;
}

export interface CompetitorScore {
  competitorId: string;
  scores: Score[];
  totalPoints: number;
  placement?: number;
  status: 'pending' | 'scoring' | 'completed';
  timeStarted?: Date;
  timeCompleted?: Date;
}

interface JudgeScoringInterfaceProps {
  competitors: Competitor[];
  scoringCriteria: ScoringCriteria[];
  onSaveScores: (scores: CompetitorScore[]) => void;
  onSubmitResults: (scores: CompetitorScore[]) => void;
}

const defaultCriteria: ScoringCriteria[] = [
  { id: 'gait', name: 'Gait', maxPoints: 25, description: 'Movement and coordination' },
  { id: 'structure', name: 'Structure', maxPoints: 25, description: 'Physical conformation' },
  { id: 'presentation', name: 'Presentation', maxPoints: 25, description: 'Ring presence and handling' },
  { id: 'overall', name: 'Overall Impression', maxPoints: 25, description: 'General quality and breed type' }
];

export function JudgeScoringInterface({ 
  competitors, 
  scoringCriteria = defaultCriteria,
  onSaveScores,
  onSubmitResults 
}: JudgeScoringInterfaceProps) {
  const [currentCompetitorIndex, setCurrentCompetitorIndex] = useState(0);
  const [competitorScores, setCompetitorScores] = useState<CompetitorScore[]>([]);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  const currentCompetitor = competitors[currentCompetitorIndex];
  const currentScore = competitorScores.find(cs => cs.competitorId === currentCompetitor?.id);
  const totalPossiblePoints = scoringCriteria.reduce((sum, criteria) => sum + criteria.maxPoints, 0);

  // Initialize competitor scores
  useEffect(() => {
    const initialScores: CompetitorScore[] = competitors.map(competitor => ({
      competitorId: competitor.id,
      scores: scoringCriteria.map(criteria => ({
        criteriaId: criteria.id,
        points: 0,
        notes: ''
      })),
      totalPoints: 0,
      status: 'pending'
    }));
    setCompetitorScores(initialScores);
  }, [competitors, scoringCriteria]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const updateScore = (criteriaId: string, points: number) => {
    setCompetitorScores(prev => prev.map(cs => {
      if (cs.competitorId === currentCompetitor.id) {
        const updatedScores = cs.scores.map(score => 
          score.criteriaId === criteriaId ? { ...score, points } : score
        );
        const totalPoints = updatedScores.reduce((sum, score) => sum + score.points, 0);
        return {
          ...cs,
          scores: updatedScores,
          totalPoints,
          status: 'scoring' as const
        };
      }
      return cs;
    }));
  };

  const completeCurrentCompetitor = () => {
    setCompetitorScores(prev => prev.map(cs => {
      if (cs.competitorId === currentCompetitor.id) {
        return {
          ...cs,
          status: 'completed' as const,
          timeCompleted: new Date()
        };
      }
      return cs;
    }));

    if (currentCompetitorIndex < competitors.length - 1) {
      setCurrentCompetitorIndex(prev => prev + 1);
    } else {
      setShowSummary(true);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCompetitorStatus = (competitorId: string) => {
    const score = competitorScores.find(cs => cs.competitorId === competitorId);
    return score?.status || 'pending';
  };

  const calculatePlacements = () => {
    const sortedScores = [...competitorScores]
      .filter(cs => cs.status === 'completed')
      .sort((a, b) => b.totalPoints - a.totalPoints);
    
    return sortedScores.map((score, index) => ({
      ...score,
      placement: index + 1
    }));
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      {/* Header with class info and timer */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Judge Scoring Interface</CardTitle>
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4" />
              <span className="font-mono text-sm">{formatTime(elapsedTime)}</span>
              <Button
                size="sm"
                variant={isTimerRunning ? "destructive" : "default"}
                onClick={() => setIsTimerRunning(!isTimerRunning)}
              >
                {isTimerRunning ? 'Stop' : 'Start'}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="text-sm text-muted-foreground">
              {competitors.length} competitors • {competitorScores.filter(cs => cs.status === 'completed').length} completed
            </span>
          </div>
        </CardHeader>
      </Card>

      {/* Competitor Navigation */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {competitors.map((competitor, index) => {
              const status = getCompetitorStatus(competitor.id);
              return (
                <Button
                  key={competitor.id}
                  variant={index === currentCompetitorIndex ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "relative flex flex-col items-center gap-1 h-auto py-2",
                    status === 'completed' && "border-green-500 bg-green-50 dark:bg-green-950"
                  )}
                  onClick={() => setCurrentCompetitorIndex(index)}
                >
                  <span className="text-xs font-bold">{competitor.armband}</span>
                  <span className="text-xs truncate max-w-full">{competitor.dogName}</span>
                  {status === 'completed' && (
                    <CheckCircle className="absolute -top-1 -right-1 h-3 w-3 text-green-600" />
                  )}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Current Competitor Scoring */}
      {currentCompetitor && (
        <motion.div
          key={currentCompetitor.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground px-2 py-1 rounded text-sm font-bold">
                      #{currentCompetitor.armband}
                    </span>
                    {currentCompetitor.dogName}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {currentCompetitor.breed} • Owner: {currentCompetitor.ownerName}
                  </p>
                </div>
                <Badge variant={
                  currentScore?.status === 'completed' ? 'default' :
                  currentScore?.status === 'scoring' ? 'secondary' : 'outline'
                }>
                  {currentScore?.status || 'pending'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Scoring Criteria */}
              {scoringCriteria.map(criteria => {
                const score = currentScore?.scores.find(s => s.criteriaId === criteria.id);
                return (
                  <div key={criteria.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{criteria.name}</h4>
                        <p className="text-xs text-muted-foreground">{criteria.description}</p>
                      </div>
                      <span className="text-sm font-mono">
                        {score?.points || 0}/{criteria.maxPoints}
                      </span>
                    </div>
                    
                    {/* Point Selection Buttons */}
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
                      {Array.from({ length: criteria.maxPoints + 1 }, (_, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant={score?.points === i ? "default" : "outline"}
                          className="h-8 w-full text-xs"
                          onClick={() => updateScore(criteria.id, i)}
                        >
                          {i}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}

              <Separator />

              {/* Total Score */}
              <div className="flex items-center justify-between text-lg font-semibold">
                <span>Total Score:</span>
                <span>
                  {currentScore?.totalPoints || 0}/{totalPossiblePoints}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={completeCurrentCompetitor}
                  disabled={!currentScore || currentScore.totalPoints === 0}
                  className="flex-1"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete & Next
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onSaveScores(competitorScores)}
                >
                  <Save className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowSummary(true)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Results Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Class Results
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {calculatePlacements().map((result, index) => {
              const competitor = competitors.find(c => c.id === result.competitorId);
              return (
                <div key={result.competitorId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                      index === 0 ? "bg-yellow-500 text-white" :
                      index === 1 ? "bg-gray-400 text-white" :
                      index === 2 ? "bg-amber-600 text-white" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {result.placement}
                    </div>
                    <div>
                      <p className="font-medium">{competitor?.dogName}</p>
                      <p className="text-sm text-muted-foreground">#{competitor?.armband}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{result.totalPoints}</p>
                    <p className="text-xs text-muted-foreground">points</p>
                  </div>
                </div>
              );
            })}
            
            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => onSubmitResults(calculatePlacements())}
                className="flex-1"
              >
                <Send className="h-4 w-4 mr-2" />
                Submit Results
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSummary(false)}
              >
                Continue Judging
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}