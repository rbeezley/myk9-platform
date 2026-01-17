/**
 * Rally Scoresheet Component
 * 
 * Specialized scoring interface for Rally competitions.
 * Handles deduction-based scoring starting from perfect score.
 */

import { useState, useCallback, useMemo } from 'react';
import { Navigation, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Types
import type { RallyScore, ValidationResult, QualificationStatus } from '@/types/scoring-types';
import { logger } from '@/services/LoggingService';

export interface RallyScoresheetProps {
  entry: {
    id: string;
    armband?: string;
    dogName?: string;
    handlerName?: string;
    classId?: string;
  };
  onSave: (score: RallyScore) => Promise<ValidationResult>;
  onCancel: () => void;
  validationErrors?: ValidationResult;
  className?: string;
}

export function RallyScoresheet({
  entry,
  onSave,
  onCancel,
  validationErrors,
  className
}: RallyScoresheetProps) {
  const [score, setScore] = useState<Partial<RallyScore>>({
    entryId: entry.id,
    classId: entry.classId || 'rally-class',
    judgeId: 'current-judge',
    format: 'rally',
    courseTime: 0,
    maxCourseTime: 300000, // 5 minutes default
    stationDeductions: 0,
    lackOfControl: 0,
    repeatStation: 0,
    totalDeductions: 0,
    finalScore: 210,
    qualifyingScore: 170,
    isQualifying: true,
    timeFault: false,
    qualification: 'Qualified',
    recordedBy: 'current-judge',
    recordedAt: new Date(),
    timestamp: new Date(),
    version: 1,
    lastModified: new Date(),
    syncStatus: 'pending'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate totals
  const calculations = useMemo(() => {
    const totalDeductions = (score.stationDeductions || 0) + 
                           (score.lackOfControl || 0) + 
                           (score.repeatStation || 0);
    const finalScore = Math.max(0, 210 - totalDeductions);
    const isQualifying = finalScore >= (score.qualifyingScore || 170) && !score.timeFault;
    const timeExceeded = score.maxCourseTime && score.courseTime && 
                         score.courseTime > score.maxCourseTime;
    
    return {
      totalDeductions,
      finalScore,
      isQualifying,
      timeExceeded
    };
  }, [score.stationDeductions, score.lackOfControl, score.repeatStation, 
      score.qualifyingScore, score.timeFault, score.courseTime, score.maxCourseTime]);

  // Update score with automatic calculations
  const updateScore = useCallback((updates: Partial<RallyScore>) => {
    setScore(prev => {
      const newScore = { ...prev, ...updates };
      
      // Update calculated fields
      newScore.totalDeductions = calculations.totalDeductions;
      newScore.finalScore = calculations.finalScore;
      newScore.isQualifying = calculations.isQualifying;
      
      // Auto-set time fault if time exceeded
      if (calculations.timeExceeded && !newScore.timeFault) {
        newScore.timeFault = true;
      }
      
      // Auto-determine qualification
      if (!calculations.isQualifying || newScore.timeFault) {
        newScore.qualification = 'Not Qualified';
      } else {
        newScore.qualification = 'Qualified';
      }

      return newScore;
    });
  }, [calculations]);

  // Quick deduction buttons
  const addStationDeduction = useCallback((amount: number) => {
    updateScore({ 
      stationDeductions: Math.max(0, (score.stationDeductions || 0) + amount)
    });
  }, [score.stationDeductions, updateScore]);

  const addLackOfControl = useCallback(() => {
    updateScore({ 
      lackOfControl: (score.lackOfControl || 0) + 10
    });
  }, [score.lackOfControl, updateScore]);

  const addRepeatStation = useCallback(() => {
    updateScore({ 
      repeatStation: (score.repeatStation || 0) + 3
    });
  }, [score.repeatStation, updateScore]);

  const handleSubmit = async () => {
    if (!score.courseTime || score.qualification === undefined) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(score as RallyScore);
    } catch (error) {
      logger.error('Failed to submit rally score:', 'scoring', {}, error as Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isComplete = score.courseTime && score.qualification;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Entry Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Navigation className="h-5 w-5 text-green-500" />
            <span>Rally - Entry #{entry.armband}</span>
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
              <div className="text-3xl font-bold text-blue-600">
                {calculations.finalScore}
              </div>
              <div className="text-sm text-muted-foreground">Final Score</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-600">
                -{calculations.totalDeductions}
              </div>
              <div className="text-sm text-muted-foreground">Total Deductions</div>
            </div>
            <div>
              <div className={cn(
                "text-3xl font-bold",
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

      {/* Course Time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-primary" />
            <span>Course Time</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="courseTime">Course Time (seconds)</Label>
              <Input
                id="courseTime"
                type="number"
                step="0.01"
                min="0"
                value={score.courseTime ? (score.courseTime / 1000).toFixed(2) : ''}
                onChange={(e) => {
                  const seconds = parseFloat(e.target.value) || 0;
                  updateScore({ courseTime: seconds * 1000 });
                }}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="maxTime">Max Course Time (seconds)</Label>
              <Input
                id="maxTime"
                type="number"
                step="0.01"
                min="0"
                value={score.maxCourseTime ? (score.maxCourseTime / 1000).toFixed(2) : ''}
                onChange={(e) => {
                  const seconds = parseFloat(e.target.value) || 0;
                  updateScore({ maxCourseTime: seconds * 1000 });
                }}
                placeholder="300.00"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="timeFault"
              checked={score.timeFault || false}
              onChange={(e) => updateScore({ timeFault: e.target.checked })}
            />
            <Label htmlFor="timeFault">Time Fault (exceeded maximum time)</Label>
          </div>

          {calculations.timeExceeded && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Course time exceeded maximum allowed time.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Deductions */}
      <Card>
        <CardHeader>
          <CardTitle>Deductions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Station Deductions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Station Deductions (1-3 pts each)</Label>
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addStationDeduction(1)}
                >
                  +1pt
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addStationDeduction(3)}
                >
                  +3pts
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addStationDeduction(-1)}
                  disabled={(score.stationDeductions || 0) <= 0}
                >
                  -1pt
                </Button>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Input
                type="number"
                min="0"
                value={score.stationDeductions || 0}
                onChange={(e) => updateScore({ stationDeductions: parseInt(e.target.value) || 0 })}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                Points for improper station execution
              </span>
            </div>
          </div>

          {/* Lack of Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Lack of Control (10 pts each)</Label>
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addLackOfControl}
                >
                  +10pts
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateScore({ lackOfControl: Math.max(0, (score.lackOfControl || 0) - 10) })}
                  disabled={(score.lackOfControl || 0) <= 0}
                >
                  -10pts
                </Button>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Input
                type="number"
                min="0"
                step="10"
                value={score.lackOfControl || 0}
                onChange={(e) => updateScore({ lackOfControl: parseInt(e.target.value) || 0 })}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                Handler guidance, tight leash, etc.
              </span>
            </div>
          </div>

          {/* Repeat Station */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Repeat Station (3 pts each)</Label>
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addRepeatStation}
                >
                  +3pts
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateScore({ repeatStation: Math.max(0, (score.repeatStation || 0) - 3) })}
                  disabled={(score.repeatStation || 0) <= 0}
                >
                  -3pts
                </Button>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Input
                type="number"
                min="0"
                step="3"
                value={score.repeatStation || 0}
                onChange={(e) => updateScore({ repeatStation: parseInt(e.target.value) || 0 })}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                Retrying a station
              </span>
            </div>
          </div>

          {/* Total Display */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-1">Total Deductions</div>
              <div className="text-2xl font-bold text-red-600">
                -{calculations.totalDeductions} points
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Qualification */}
      <Card>
        <CardHeader>
          <CardTitle>Qualification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
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
            <div>
              <Label htmlFor="qualifyingScore">Qualifying Score</Label>
              <Input
                id="qualifyingScore"
                type="number"
                min="0"
                max="210"
                value={score.qualifyingScore || 170}
                onChange={(e) => updateScore({ qualifyingScore: parseInt(e.target.value) || 170 })}
              />
            </div>
          </div>

          {!calculations.isQualifying && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {score.timeFault 
                  ? 'Time fault results in non-qualifying score'
                  : `Score below qualifying threshold (${score.qualifyingScore || 170} required)`
                }
              </AlertDescription>
            </Alert>
          )}

          {score.excusedStation && (
            <div>
              <Label htmlFor="excusedStation">Excused Station</Label>
              <Input
                id="excusedStation"
                value={score.excusedStation || ''}
                onChange={(e) => updateScore({ excusedStation: e.target.value })}
                placeholder="Station number or description"
              />
            </div>
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