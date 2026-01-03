/**
 * Tracking Scoresheet Component
 * 
 * Specialized scoring interface for tracking tests including:
 * - Pass/fail scoring system
 * - Track details (length, age, articles)
 * - Weather condition tracking
 * - Article finding assessment
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

// Icons
import { MapPin, Thermometer, CheckCircle, XCircle } from 'lucide-react';

// Types
import type { TrackingScore } from '@/types/scoring-types';
import type { EntryWithResult } from '../ResultEntryNavigation';

export interface TrackingScoresheetProps {
  entry: EntryWithResult;
  initialScore?: Partial<TrackingScore>;
  onScoreChange: (score: Partial<TrackingScore>) => void;
  onSave: (score: TrackingScore) => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Tracking test scoring component with pass/fail assessment
 */
export function TrackingScoresheet({
  entry,
  initialScore,
  onScoreChange,
  onSave,
  onCancel,
  disabled = false,
  className
}: TrackingScoresheetProps) {
  const [score, setScore] = useState<Partial<TrackingScore>>({
    format: 'tracking',
    entryId: entry.id,
    judgeId: '', // Will be set by parent component
    timestamp: new Date(),
    passed: false,
    articlesFindRequired: 3,
    articlesFound: 0,
    ...initialScore
  });

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Handle pass/fail toggle
  const handlePassFailChange = useCallback((passed: boolean) => {
    const updatedScore = { ...score, passed };
    setScore(updatedScore);
    onScoreChange(updatedScore);
  }, [score, onScoreChange]);

  // Handle articles found change
  const handleArticlesFoundChange = useCallback((value: string) => {
    const articlesFound = parseInt(value) || 0;
    const updatedScore = {
      ...score,
      articlesFound,
      // Auto-fail if not all articles found
      passed: articlesFound >= (score.articlesFindRequired || 0) && score.passed
    };
    setScore(updatedScore);
    onScoreChange(updatedScore);
  }, [score, onScoreChange]);

  // Validate score before submission
  const validateScore = useCallback((): string[] => {
    const errors: string[] = [];
    
    if (score.passed === undefined) {
      errors.push('Pass/fail status is required');
    }
    
    if (!score.articlesFindRequired || score.articlesFindRequired < 1) {
      errors.push('Number of required articles must be specified');
    }
    
    if (score.articlesFound === undefined || score.articlesFound < 0) {
      errors.push('Number of articles found must be specified');
    }
    
    if (score.articlesFound !== undefined && score.articlesFindRequired !== undefined) {
      if (score.articlesFound > score.articlesFindRequired) {
        errors.push('Articles found cannot exceed articles required');
      }
    }
    
    return errors;
  }, [score]);

  // Handle save
  const handleSave = useCallback(() => {
    const errors = validateScore();
    setValidationErrors(errors);
    
    if (errors.length === 0) {
      const finalScore: TrackingScore = {
        ...score,
        timestamp: new Date()
      } as TrackingScore;
      
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
            <MapPin className="h-5 w-5 text-green-600" />
            Entry #{entry.displayInfo.armband}: {entry.displayInfo.dogName}
          </CardTitle>
          <CardDescription>
            {entry.displayInfo.dogBreed} • {entry.displayInfo.handlerName}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Pass/Fail Assessment */}
      <Card>
        <CardHeader>
          <CardTitle>Test Result</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center space-x-8">
            <Button
              variant={score.passed === true ? "default" : "outline"}
              onClick={() => handlePassFailChange(true)}
              disabled={disabled}
              className="flex items-center gap-2 h-16 px-8"
            >
              <CheckCircle className="h-6 w-6" />
              PASS
            </Button>
            
            <Button
              variant={score.passed === false ? "destructive" : "outline"}
              onClick={() => handlePassFailChange(false)}
              disabled={disabled}
              className="flex items-center gap-2 h-16 px-8"
            >
              <XCircle className="h-6 w-6" />
              FAIL
            </Button>
          </div>
          
          {score.passed !== undefined && (
            <div className="text-center">
              <Badge 
                variant={score.passed ? "default" : "destructive"}
                className="text-sm"
              >
                {score.passed ? "PASSED" : "FAILED"}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Track Details */}
      <Card>
        <CardHeader>
          <CardTitle>Track Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="track-length">Track Length (yards)</Label>
              <Input
                id="track-length"
                type="number"
                value={score.trackLength || ''}
                onChange={(e) => {
                  const updatedScore = { ...score, trackLength: parseInt(e.target.value) || undefined };
                  setScore(updatedScore);
                  onScoreChange(updatedScore);
                }}
                disabled={disabled}
                placeholder="e.g., 500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="track-age">Track Age (hours)</Label>
              <Input
                id="track-age"
                type="number"
                value={score.trackAge || ''}
                onChange={(e) => {
                  const updatedScore = { ...score, trackAge: parseInt(e.target.value) || undefined };
                  setScore(updatedScore);
                  onScoreChange(updatedScore);
                }}
                disabled={disabled}
                placeholder="e.g., 2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="articles-required">Articles Required *</Label>
              <Select
                value={score.articlesFindRequired?.toString() || ''}
                onValueChange={(value) => {
                  const updatedScore = { ...score, articlesFindRequired: parseInt(value) };
                  setScore(updatedScore);
                  onScoreChange(updatedScore);
                }}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select number" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Article</SelectItem>
                  <SelectItem value="2">2 Articles</SelectItem>
                  <SelectItem value="3">3 Articles</SelectItem>
                  <SelectItem value="4">4 Articles</SelectItem>
                  <SelectItem value="5">5 Articles</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="articles-found">Articles Found *</Label>
              <Input
                id="articles-found"
                type="number"
                min="0"
                max={score.articlesFindRequired || 5}
                value={score.articlesFound || ''}
                onChange={(e) => handleArticlesFoundChange(e.target.value)}
                disabled={disabled}
                placeholder="0"
              />
            </div>
          </div>

          {/* Articles Progress */}
          {score.articlesFindRequired && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Articles Progress</span>
                <Badge variant={
                  score.articlesFound === score.articlesFindRequired ? "default" : "secondary"
                }>
                  {score.articlesFound || 0} / {score.articlesFindRequired}
                </Badge>
              </div>
              <div className="w-full bg-background rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{
                    width: `${((score.articlesFound || 0) / score.articlesFindRequired) * 100}%`
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weather Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5 text-blue-500" />
            Weather Conditions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature (°F)</Label>
              <Input
                id="temperature"
                type="number"
                value={score.temperature || ''}
                onChange={(e) => {
                  const updatedScore = { ...score, temperature: parseInt(e.target.value) || undefined };
                  setScore(updatedScore);
                  onScoreChange(updatedScore);
                }}
                disabled={disabled}
                placeholder="e.g., 72"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wind-direction">Wind Direction</Label>
              <Select
                value={score.windDirection || ''}
                onValueChange={(value) => {
                  const updatedScore = { ...score, windDirection: value };
                  setScore(updatedScore);
                  onScoreChange(updatedScore);
                }}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N">North</SelectItem>
                  <SelectItem value="NE">Northeast</SelectItem>
                  <SelectItem value="E">East</SelectItem>
                  <SelectItem value="SE">Southeast</SelectItem>
                  <SelectItem value="S">South</SelectItem>
                  <SelectItem value="SW">Southwest</SelectItem>
                  <SelectItem value="W">West</SelectItem>
                  <SelectItem value="NW">Northwest</SelectItem>
                  <SelectItem value="Calm">Calm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="weather-conditions">Weather Conditions</Label>
            <Textarea
              id="weather-conditions"
              value={score.weatherConditions || ''}
              onChange={(e) => {
                const updatedScore = { ...score, weatherConditions: e.target.value };
                setScore(updatedScore);
                onScoreChange(updatedScore);
              }}
              disabled={disabled}
              placeholder="Describe weather conditions (sunny, cloudy, light rain, etc.)"
              rows={3}
            />
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

export default TrackingScoresheet;