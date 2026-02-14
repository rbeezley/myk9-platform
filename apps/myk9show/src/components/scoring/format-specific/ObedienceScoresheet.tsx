/**
 * Obedience Scoresheet Component
 * 
 * Specialized scoring interface for Obedience competitions.
 * Handles exercise-based scoring with point deductions.
 */

import { useState, useCallback, useMemo } from 'react';
import { Award, Minus, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/hooks/useAuthContext';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Types
import type { ObedienceScore, ObedienceExercise, ValidationResult } from '@/types/scoring-types';
import type { QualificationStatus } from '@/types/scent-work-types';
import { logger } from '@/services/LoggingService';

export interface ObedienceScoresheetProps {
  entry: {
    id: string;
    armband?: string;
    dogName?: string;
    handlerName?: string;
    classId?: string;
  };
  onSave: (score: ObedienceScore) => Promise<ValidationResult>;
  onCancel: () => void;
  validationErrors?: ValidationResult;
  className?: string;
}

// Standard obedience exercises (Novice level example)
const DEFAULT_EXERCISES: Omit<ObedienceExercise, 'pointsAwarded' | 'deductions'>[] = [
  { name: 'Heel on Leash', maxPoints: 40, nonQualifying: false, excused: false },
  { name: 'Stand for Examination', maxPoints: 30, nonQualifying: false, excused: false },
  { name: 'Heel Free', maxPoints: 40, nonQualifying: false, excused: false },
  { name: 'Recall', maxPoints: 30, nonQualifying: false, excused: false },
  { name: 'Long Sit', maxPoints: 30, nonQualifying: false, excused: false },
  { name: 'Long Down', maxPoints: 30, nonQualifying: false, excused: false }
];

export function ObedienceScoresheet({
  entry,
  onSave,
  onCancel,
  validationErrors,
  className
}: ObedienceScoresheetProps) {
  const { user } = useAuthContext();

  const [score, setScore] = useState<Partial<ObedienceScore>>({
    entryId: entry.id,
    classId: entry.classId || 'obedience-class',
    judgeId: user?.id || 'unknown',
    format: 'obedience',
    exercises: DEFAULT_EXERCISES.map(ex => ({
      ...ex,
      pointsAwarded: ex.maxPoints,
      deductions: []
    })),
    totalScore: 200,
    maximumScore: 200,
    qualifyingScore: 170,
    isQualifying: true,
    qualification: 'Qualified',
    recordedBy: user?.id || 'unknown',
    recordedAt: new Date(),
    timestamp: new Date(),
    version: 1,
    lastModified: new Date(),
    syncStatus: 'pending'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate totals
  const calculations = useMemo(() => {
    const exercises = score.exercises || [];
    const totalScore = exercises.reduce((sum, ex) => sum + ex.pointsAwarded, 0);
    const maximumScore = exercises.reduce((sum, ex) => sum + ex.maxPoints, 0);
    const hasNonQualifyingExercise = exercises.some(ex => ex.nonQualifying);
    const isQualifying = totalScore >= (score.qualifyingScore || 170) && !hasNonQualifyingExercise;
    
    return {
      totalScore,
      maximumScore,
      isQualifying,
      hasNonQualifyingExercise
    };
  }, [score.exercises, score.qualifyingScore]);

  // Update score with automatic calculations
  const updateScore = useCallback((updates: Partial<ObedienceScore>) => {
    setScore(prev => {
      const newScore = { ...prev, ...updates };
      
      // Update calculated fields
      newScore.totalScore = calculations.totalScore;
      newScore.maximumScore = calculations.maximumScore;
      newScore.isQualifying = calculations.isQualifying;
      
      if (!calculations.isQualifying) {
        newScore.qualification = 'Not Qualified';
        if (calculations.hasNonQualifyingExercise) {
          const nqExercise = newScore.exercises?.find(ex => ex.nonQualifying);
          newScore.nonQualifyingExercise = nqExercise?.name;
        }
      } else {
        newScore.qualification = 'Qualified';
        newScore.nonQualifyingExercise = undefined;
      }

      return newScore;
    });
  }, [calculations]);

  // Update individual exercise
  const updateExercise = useCallback((index: number, updates: Partial<ObedienceExercise>) => {
    const exercises = [...(score.exercises || [])];
    exercises[index] = { ...exercises[index], ...updates };
    updateScore({ exercises });
  }, [score.exercises, updateScore]);

  // Add deduction to exercise
  const addDeduction = useCallback((exerciseIndex: number, points: number, reason: string) => {
    const exercises = [...(score.exercises || [])];
    const exercise = exercises[exerciseIndex];
    
    exercise.deductions.push({ reason, points, description: '' });
    exercise.pointsAwarded = Math.max(0, exercise.maxPoints - 
      exercise.deductions.reduce((sum, d) => sum + d.points, 0));
    
    updateScore({ exercises });
  }, [score.exercises, updateScore]);

  // Remove deduction from exercise
  const removeDeduction = useCallback((exerciseIndex: number, deductionIndex: number) => {
    const exercises = [...(score.exercises || [])];
    const exercise = exercises[exerciseIndex];
    
    exercise.deductions.splice(deductionIndex, 1);
    exercise.pointsAwarded = Math.max(0, exercise.maxPoints - 
      exercise.deductions.reduce((sum, d) => sum + d.points, 0));
    
    updateScore({ exercises });
  }, [score.exercises, updateScore]);

  const handleSubmit = async () => {
    if (!score.exercises || score.qualification === undefined) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(score as ObedienceScore);
    } catch (error) {
      logger.error('Failed to submit obedience score:', 'scoring', {}, error as Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isComplete = score.exercises && score.qualification;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Entry Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Award className="h-5 w-5 text-purple-500" />
            <span>Obedience - Entry #{entry.armband}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-muted-foreground">Dog</span>
              <p className="font-medium">{entry.dogName || 'Unknown Dog'}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Handler</span>
              <p className="font-medium">{entry.handlerName || 'Unknown Handler'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {calculations.totalScore}
              </div>
              <div className="text-sm text-muted-foreground">Total Score</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {calculations.maximumScore}
              </div>
              <div className="text-sm text-muted-foreground">Maximum Possible</div>
            </div>
            <div>
              <div className={cn(
                "text-2xl font-bold",
                calculations.isQualifying ? "text-green-600" : "text-red-600"
              )}>
                {calculations.isQualifying ? "Q" : "NQ"}
              </div>
              <div className="text-sm text-muted-foreground">
                {calculations.isQualifying ? "Qualifying" : "Non-Qualifying"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exercises */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Exercises</h3>
        {score.exercises?.map((exercise, index) => (
          <Card key={index}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{exercise.name}</CardTitle>
                <div className="flex items-center space-x-2">
                  <span className={cn(
                    "font-bold",
                    exercise.pointsAwarded === exercise.maxPoints ? "text-green-600" : "text-blue-600"
                  )}>
                    {exercise.pointsAwarded}/{exercise.maxPoints}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Exercise Controls */}
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`nq-${index}`}
                    checked={exercise.nonQualifying || false}
                    onChange={(e) => updateExercise(index, { nonQualifying: e.target.checked })}
                  />
                  <Label htmlFor={`nq-${index}`} className="text-sm">Non-Qualifying</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`excused-${index}`}
                    checked={exercise.excused || false}
                    onChange={(e) => updateExercise(index, { excused: e.target.checked })}
                  />
                  <Label htmlFor={`excused-${index}`} className="text-sm">Excused</Label>
                </div>
              </div>

              {/* Deductions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Deductions</Label>
                  <div className="flex items-center space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addDeduction(index, 1, 'Minor error')}
                    >
                      <Minus className="h-3 w-3" />
                      1pt
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addDeduction(index, 3, 'Substantial error')}
                    >
                      <Minus className="h-3 w-3" />
                      3pts
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addDeduction(index, 5, 'Major error')}
                    >
                      <Minus className="h-3 w-3" />
                      5pts
                    </Button>
                  </div>
                </div>

                {exercise.deductions.map((deduction, deductionIndex) => (
                  <div key={deductionIndex} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <span className="text-sm">-{deduction.points}pts: {deduction.reason}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeDeduction(index, deductionIndex)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              {/* Manual Score Override */}
              <div className="flex items-center space-x-2">
                <Label htmlFor={`manual-${index}`} className="text-sm">Manual Score:</Label>
                <Input
                  id={`manual-${index}`}
                  type="number"
                  min="0"
                  max={exercise.maxPoints}
                  value={exercise.pointsAwarded}
                  onChange={(e) => updateExercise(index, { pointsAwarded: parseInt(e.target.value) || 0 })}
                  className="w-20"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Qualification Status */}
      <Card>
        <CardHeader>
          <CardTitle>Final Qualification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Qualification Status</Label>
            <select
              className="w-full mt-1 px-3 py-2 border rounded-md"
              value={score.qualification || 'Qualified'}
              onChange={(e) => updateScore({ qualification: e.target.value as QualificationStatus })}
            >
              <option value="Qualified">Qualified</option>
              <option value="Not Qualified">Not Qualified</option>
              <option value="Absent">Absent</option>
              <option value="Excused">Excused</option>
              <option value="Withdrawn">Withdrawn</option>
            </select>
          </div>

          {!calculations.isQualifying && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {calculations.totalScore < (score.qualifyingScore || 170) 
                  ? `Score below qualifying threshold (${score.qualifyingScore || 170} required)`
                  : 'Non-qualifying exercise failure'
                }
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {validationErrors && !validationErrors.isValid && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {validationErrors.errors.map((error, index) => (
                <li key={index}>{error.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!isComplete || isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Save Score'}
        </Button>
      </div>
    </div>
  );
}