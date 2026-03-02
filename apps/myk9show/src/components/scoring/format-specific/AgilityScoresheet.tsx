/**
 * Agility Scoresheet Component
 * 
 * Specialized scoring interface for Agility competitions.
 * Handles time + faults scoring with real-time placement calculations.
 */

import { useState, useCallback } from 'react';
import { Clock, Zap, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/hooks/useAuthContext';
import '@/styles/myk9-show-details.css';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Types
import type { AgilityScore, ValidationResult } from '@/types/scoring-types';
import type { QualificationStatus } from '@/types/scent-work-types';
import { logger } from '@/services/LoggingService';

export interface AgilityScoresheetProps {
  entry: {
    id: string;
    armband?: string;
    dogName?: string;
    handlerName?: string;
    classId?: string;
  };
  onSave: (score: AgilityScore) => Promise<ValidationResult>;
  onCancel: () => void;
  validationErrors?: ValidationResult;
  className?: string;
}

export function AgilityScoresheet({
  entry,
  onSave,
  onCancel,
  validationErrors,
  className
}: AgilityScoresheetProps) {
  const { user } = useAuthContext();

  const [score, setScore] = useState<Partial<AgilityScore>>({
    entryId: entry.id,
    classId: entry.classId || 'agility-class',
    judgeId: user?.id || 'unknown',
    format: 'agility',
    courseTime: 0,
    jumpFaults: 0,
    refusals: 0,
    otherFaults: 0,
    totalFaults: 0,
    qualification: 'Qualified',
    excusedEliminated: false,
    recordedBy: user?.id || 'unknown',
    recordedAt: new Date(),
    timestamp: new Date(),
    version: 1,
    lastModified: new Date(),
    syncStatus: 'pending'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate total faults
  const calculateTotalFaults = useCallback((jumpFaults: number, refusals: number, otherFaults: number) => {
    return (jumpFaults * 5) + (refusals * 20) + otherFaults;
  }, []);

  // Update score with automatic calculations
  const updateScore = useCallback((updates: Partial<AgilityScore>) => {
    setScore(prev => {
      const newScore = { ...prev, ...updates };
      
      // Recalculate total faults if fault counts changed
      if ('jumpFaults' in updates || 'refusals' in updates || 'otherFaults' in updates) {
        newScore.totalFaults = calculateTotalFaults(
          newScore.jumpFaults || 0,
          newScore.refusals || 0,
          newScore.otherFaults || 0
        );
      }

      // Auto-determine qualification based on faults and eliminations
      if (newScore.excusedEliminated || (newScore.refusals || 0) >= 3) {
        newScore.qualification = 'Not Qualified';
        if (newScore.refusals && newScore.refusals >= 3) {
          newScore.eliminationReason = 'Three refusals';
        }
      } else if (newScore.totalFaults === 0) {
        newScore.qualification = 'Qualified';
      }

      return newScore;
    });
  }, [calculateTotalFaults]);

  const handleSubmit = async () => {
    if (!score.courseTime || score.qualification === undefined) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(score as AgilityScore);
    } catch (error) {
      logger.error('Failed to submit agility score:', 'scoring', {}, error as Error);
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
            <Zap className="h-5 w-5 text-blue-500" />
            <span>Agility - Entry #{entry.armband}</span>
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
              <Label htmlFor="sct">Standard Course Time (optional)</Label>
              <Input
                id="sct"
                type="number"
                step="0.01"
                min="0"
                value={score.standardCourseTime ? (score.standardCourseTime / 1000).toFixed(2) : ''}
                onChange={(e) => {
                  const seconds = parseFloat(e.target.value) || 0;
                  updateScore({ standardCourseTime: seconds * 1000 });
                }}
                placeholder="0.00"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Faults */}
      <Card>
        <CardHeader>
          <CardTitle>Faults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="jumpFaults">Jump Faults (5 pts each)</Label>
              <Input
                id="jumpFaults"
                type="number"
                min="0"
                value={score.jumpFaults || 0}
                onChange={(e) => updateScore({ jumpFaults: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="refusals">Refusals (20 pts each)</Label>
              <Input
                id="refusals"
                type="number"
                min="0"
                max="3"
                value={score.refusals || 0}
                onChange={(e) => updateScore({ refusals: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="otherFaults">Other Faults</Label>
              <Input
                id="otherFaults"
                type="number"
                min="0"
                value={score.otherFaults || 0}
                onChange={(e) => updateScore({ otherFaults: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <div className="text-center">
              <span className="text-lg font-bold">
                Total Faults: {score.totalFaults || 0}
              </span>
            </div>
          </div>

          {(score.refusals || 0) >= 3 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Three refusals result in elimination.
              </AlertDescription>
            </Alert>
          )}
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
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="eliminated"
                checked={score.excusedEliminated || false}
                onChange={(e) => updateScore({ excusedEliminated: e.target.checked })}
              />
              <Label htmlFor="eliminated">Excused/Eliminated</Label>
            </div>
          </div>

          {score.excusedEliminated && (
            <div>
              <Label htmlFor="eliminationReason">Elimination Reason</Label>
              <Input
                id="eliminationReason"
                value={score.eliminationReason || ''}
                onChange={(e) => updateScore({ eliminationReason: e.target.value })}
                placeholder="Reason for elimination"
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