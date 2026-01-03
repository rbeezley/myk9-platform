/**
 * Conformation Scoresheet Component
 * 
 * Specialized scoring interface for conformation dog shows including:
 * - Placement-based scoring (1st, 2nd, 3rd, etc.)
 * - Award levels (Winners, Best of Breed, etc.)
 * - Championship points calculation
 * - Judge assessment scores
 * - Competition level tracking
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';

// Icons
import { Award, Star, Trophy, CheckCircle } from 'lucide-react';

// Types
import type { ConformationScore } from '@/types/scoring-types';
import type { EntryWithResult } from '../ResultEntryNavigation';

export interface ConformationScoresheetProps {
  entry: EntryWithResult;
  initialScore?: Partial<ConformationScore>;
  onScoreChange: (score: Partial<ConformationScore>) => void;
  onSave: (score: ConformationScore) => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}

type AwardLevel = 'Winners' | 'Best of Breed' | 'Best of Opposite Sex' | 'Select Dog' | 'Select Bitch' | 'Award of Merit';
type CompetitionLevel = 'Puppy' | 'Open' | 'Bred-by-Exhibitor' | 'American Bred' | 'Specials';

/**
 * Conformation scoring component with placement and points calculation
 */
export function ConformationScoresheet({
  entry,
  initialScore,
  onScoreChange,
  onSave,
  onCancel,
  disabled = false,
  className
}: ConformationScoresheetProps) {
  const [score, setScore] = useState<Partial<ConformationScore>>({
    format: 'conformation',
    entryId: entry.id,
    judgeId: '', // Will be set by parent component
    timestamp: new Date(),
    pointsAwarded: 0,
    competitionLevel: 'Open',
    ...initialScore
  });

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Calculate championship points based on placement and competition size
  const calculatePoints = useCallback((placement?: number, competitionSize = 5) => {
    if (!placement || placement > 5) return 0;
    
    // Standard AKC point scale
    const pointScale = [15, 14, 13, 12, 11]; // For competition of 5 dogs
    const basePoints = pointScale[placement - 1] || 0;
    
    // Adjust for actual competition size
    const adjustedPoints = Math.max(1, Math.min(5, Math.floor(basePoints * (competitionSize / 5))));
    return adjustedPoints;
  }, []);

  // Handle placement change and auto-calculate points
  const handlePlacementChange = useCallback((placement: string) => {
    const placementNum = parseInt(placement);
    const points = calculatePoints(placementNum);
    const isMajor = points >= 3;
    
    const updatedScore = {
      ...score,
      placement: placementNum,
      pointsAwarded: points,
      majorWin: isMajor
    };
    
    setScore(updatedScore);
    onScoreChange(updatedScore);
  }, [score, calculatePoints, onScoreChange]);

  // Handle award level change
  const handleAwardLevelChange = useCallback((awardLevel: AwardLevel) => {
    const updatedScore = {
      ...score,
      awardLevel,
      // Special awards typically get additional points
      pointsAwarded: awardLevel === 'Best of Breed' ? 
        Math.max(score.pointsAwarded || 0, 3) : score.pointsAwarded
    };
    
    setScore(updatedScore);
    onScoreChange(updatedScore);
  }, [score, onScoreChange]);

  // Handle judge assessment scores
  const handleAssessmentChange = useCallback((field: 'gaitScore' | 'typeScore' | 'temperamentScore', value: number[]) => {
    const updatedScore = {
      ...score,
      [field]: value[0]
    };
    
    setScore(updatedScore);
    onScoreChange(updatedScore);
  }, [score, onScoreChange]);

  // Validate score before submission
  const validateScore = useCallback((): string[] => {
    const errors: string[] = [];
    
    if (!score.placement || score.placement < 1) {
      errors.push('Placement is required');
    }
    
    if (score.pointsAwarded === undefined || score.pointsAwarded < 0) {
      errors.push('Points awarded must be 0 or greater');
    }
    
    if (!score.competitionLevel) {
      errors.push('Competition level is required');
    }
    
    return errors;
  }, [score]);

  // Handle save
  const handleSave = useCallback(() => {
    const errors = validateScore();
    setValidationErrors(errors);
    
    if (errors.length === 0) {
      const finalScore: ConformationScore = {
        ...score,
        timestamp: new Date()
      } as ConformationScore;
      
      onSave(finalScore);
    }
  }, [score, validateScore, onSave]);

  // Update parent when score changes
  useEffect(() => {
    if (initialScore) {
      setScore(prev => ({ ...prev, ...initialScore }));
    }
  }, [initialScore]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Entry Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-600" />
            Entry #{entry.displayInfo.armband}: {entry.displayInfo.dogName}
          </CardTitle>
          <CardDescription>
            {entry.displayInfo.dogBreed} • {entry.displayInfo.handlerName}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Placement and Awards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-blue-600" />
            Placement & Awards
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="placement">Placement *</Label>
              <Select
                value={score.placement?.toString() || ''}
                onValueChange={handlePlacementChange}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select placement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1st Place</SelectItem>
                  <SelectItem value="2">2nd Place</SelectItem>
                  <SelectItem value="3">3rd Place</SelectItem>
                  <SelectItem value="4">4th Place</SelectItem>
                  <SelectItem value="5">No Placement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="competition-level">Competition Level *</Label>
              <Select
                value={score.competitionLevel || ''}
                onValueChange={(value: CompetitionLevel) => {
                  const updatedScore = { ...score, competitionLevel: value };
                  setScore(updatedScore);
                  onScoreChange(updatedScore);
                }}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Puppy">Puppy</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Bred-by-Exhibitor">Bred-by-Exhibitor</SelectItem>
                  <SelectItem value="American Bred">American Bred</SelectItem>
                  <SelectItem value="Specials">Specials</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="award-level">Award Level (if applicable)</Label>
            <Select
              value={score.awardLevel || ''}
              onValueChange={handleAwardLevelChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select award (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Winners">Winners</SelectItem>
                <SelectItem value="Best of Breed">Best of Breed</SelectItem>
                <SelectItem value="Best of Opposite Sex">Best of Opposite Sex</SelectItem>
                <SelectItem value="Select Dog">Select Dog</SelectItem>
                <SelectItem value="Select Bitch">Select Bitch</SelectItem>
                <SelectItem value="Award of Merit">Award of Merit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Points Display */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <div className="font-medium">Championship Points</div>
              <div className="text-sm text-muted-foreground">
                Based on placement and competition
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={score.majorWin ? "default" : "secondary"}>
                {score.pointsAwarded || 0} points
              </Badge>
              {score.majorWin && (
                <Badge variant="default" className="bg-amber-500">
                  Major Win
                </Badge>
              )}
            </div>
          </div>

          {/* Special Recognition */}
          <div className="flex gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="specialty-win"
                checked={score.specialtyWin || false}
                onCheckedChange={(checked) => {
                  const updatedScore = { ...score, specialtyWin: !!checked };
                  setScore(updatedScore);
                  onScoreChange(updatedScore);
                }}
                disabled={disabled}
              />
              <Label htmlFor="specialty-win">Specialty Show Win</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Judge Assessment (Optional) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            Judge Assessment (Optional)
          </CardTitle>
          <CardDescription>
            Detailed scoring on specific aspects (1-10 scale)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Gait</Label>
                <span className="text-sm text-muted-foreground">
                  {score.gaitScore || 5}/10
                </span>
              </div>
              <Slider
                value={[score.gaitScore || 5]}
                onValueChange={(value) => handleAssessmentChange('gaitScore', value)}
                max={10}
                min={1}
                step={1}
                disabled={disabled}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Type</Label>
                <span className="text-sm text-muted-foreground">
                  {score.typeScore || 5}/10
                </span>
              </div>
              <Slider
                value={[score.typeScore || 5]}
                onValueChange={(value) => handleAssessmentChange('typeScore', value)}
                max={10}
                min={1}
                step={1}
                disabled={disabled}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Temperament</Label>
                <span className="text-sm text-muted-foreground">
                  {score.temperamentScore || 5}/10
                </span>
              </div>
              <Slider
                value={[score.temperamentScore || 5]}
                onValueChange={(value) => handleAssessmentChange('temperamentScore', value)}
                max={10}
                min={1}
                step={1}
                disabled={disabled}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Validation Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index} className="text-sm text-destructive">
                  {error}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={disabled}
        >
          Cancel
        </Button>
        
        <Button
          onClick={handleSave}
          disabled={disabled || validationErrors.length > 0}
          className="flex items-center gap-2"
        >
          <CheckCircle className="h-4 w-4" />
          Save Score
        </Button>
      </div>
    </div>
  );
}

export default ConformationScoresheet;