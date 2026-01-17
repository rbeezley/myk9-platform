/**
 * Scent Work Scoresheet Component
 * 
 * Main judging interface for single-area Scent Work classes.
 * Provides timer integration, qualification selection, fault counting,
 * and result submission following the proven Flutter app UX patterns.
 */

import { useState, useCallback } from 'react';
import { Clock, User, Dog, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import '@/styles/apple-show-details.css';

// UI Components
import { Button } from '@/components/ui/button';

// Timer components
import { DualTimerDisplay } from '@/components/common/DualTimerDisplay';

// Types and utilities
import { logger } from '@/services/LoggingService';
import type {
  ScentWorkEntry, 
  ScentWorkResult, 
  QualificationStatus
} from '@/types/scent-work-types';
import type { ValidationResult } from '@/types/scoring-types';
import { getTimeLimit, isTimeExpired, validateScentWorkResult } from '@/types/scent-work-types';
import { msToDisplay } from '@/lib/timeUtils';

// Props interface
export interface ScentWorkScoresheetProps {
  entry: ScentWorkEntry | {
    id: string;
    classId?: string;
    armband?: string;
    dogName?: string;
    dogBreed?: string;
    handlerName?: string;
    classConfig?: {
      element: string;
      level: string;
    };
    displayInfo?: {
      armband: string;
      dogName: string;
      dogBreed: string;
      handlerName: string;
      dogId: string;
      handlerId: string;
    };
  };
  onSave: (result: ScentWorkResult) => Promise<ValidationResult>; // Always return validation result
  onCancel: () => void;
  validationErrors?: ValidationResult;
  className?: string;
}

/**
 * Single-area Scent Work scoresheet component
 * 
 * Features:
 * - Large dog information display (armband, name, breed, handler)
 * - Integrated timer with auto-population
 * - Progressive qualification selector
 * - Fault counter (shown only after Qualified selected)
 * - Save confirmation with data summary
 */
export function ScentWorkScoresheet({
  entry,
  onSave,
  onCancel,
  className
}: ScentWorkScoresheetProps) {

  // Extract class configuration and time limits - handle mock data
  const classConfig = entry.classConfig || { 
    element: 'Interior' as 'Container' | 'Interior' | 'Exterior' | 'Buried', 
    level: 'Novice' as 'Novice' | 'Advanced' | 'Excellent' | 'Masters' 
  };
  const displayInfo = entry.displayInfo || {
    armband: 'armband' in entry ? entry.armband || '001' : '001',
    dogName: 'dogName' in entry ? entry.dogName || 'Test Dog' : 'Test Dog',
    dogBreed: 'dogBreed' in entry ? entry.dogBreed || 'Unknown' : 'Unknown',
    handlerName: 'handlerName' in entry ? entry.handlerName || 'Test Handler' : 'Test Handler',
    dogId: 'unknown',
    handlerId: 'unknown'
  };
  const maxTimeMs = getTimeLimit(
    classConfig.element as 'Container' | 'Interior' | 'Exterior' | 'Buried', 
    classConfig.level as 'Novice' | 'Advanced' | 'Excellent' | 'Masters'
  );

  // Result state
  const [result, setResult] = useState<Partial<ScentWorkResult>>({
    entryId: entry.id,
    classId: entry.classId || 'mock-class-id',
    searchTime: 0,
    maxTimeAllowed: maxTimeMs,
    qualification: undefined,
    faults: 0,
    recordedBy: 'current-judge', // TODO: Get from auth context
    recordedAt: new Date()
  });

  // UI state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Timer event handlers
  const handleSearchTime = useCallback((timeMs: number) => {
    setResult(prev => ({
      ...prev,
      searchTime: timeMs
    }));
  }, []);

  const handleTimeWarning = useCallback((remainingMs: number) => {
    logger.debug(`Time warning: ${remainingMs}ms remaining`, 'scoring', {});
    // Audio handled by DualTimerDisplay component
  }, []);

  const handleTimeExpired = useCallback(() => {
    logger.debug('Time expired - automatic NQ', 'scoring', {});
    setResult(prev => ({
      ...prev,
      qualification: 'Not Qualified',
      nqReason: 'timeout'
    }));
  }, []);

  // Qualification selection handler
  const handleQualificationChange = useCallback((qualification: QualificationStatus) => {
    setResult(prev => {
      const updated = {
        ...prev,
        qualification,
        // Reset faults when changing qualification
        faults: qualification === 'Qualified' ? prev.faults || 0 : 0,
        // Clear NQ reason when qualifying
        nqReason: qualification === 'Qualified' ? undefined : prev.nqReason
      };

      // Auto-set NQ reason for non-qualification scenarios
      if (qualification === 'Not Qualified' && !updated.nqReason) {
        if (isTimeExpired(updated.searchTime || 0, maxTimeMs)) {
          updated.nqReason = 'timeout';
        } else {
          updated.nqReason = 'noFind'; // Default NQ reason
        }
      }

      return updated;
    });
  }, [maxTimeMs]);

  // Fault counter handlers
  const handleFaultIncrement = useCallback(() => {
    setResult(prev => ({
      ...prev,
      faults: Math.min((prev.faults || 0) + 1, 99) // Cap at 99 faults
    }));
  }, []);

  const handleFaultDecrement = useCallback(() => {
    setResult(prev => ({
      ...prev,
      faults: Math.max((prev.faults || 0) - 1, 0) // Minimum 0 faults
    }));
  }, []);

  // Save handlers
  const handleSaveClick = useCallback(() => {
    if (!validateScentWorkResult(result)) {
      setSaveError('Please complete all required fields');
      return;
    }
    setShowConfirmation(true);
    setSaveError(null);
  }, [result]);

  const handleConfirmSave = useCallback(async () => {
    if (!validateScentWorkResult(result)) {
      setSaveError('Invalid result data');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await onSave(result as ScentWorkResult);
      setShowConfirmation(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save result');
    } finally {
      setIsSaving(false);
    }
  }, [result, onSave]);

  // Check if result is complete for save button state
  const isResultComplete = validateScentWorkResult(result);

  // Qualification options with colors matching Flutter app
  const qualificationOptions: { value: QualificationStatus; label: string; color: string }[] = [
    { value: 'Qualified', label: 'Qualified', color: 'bg-blue-600 hover:bg-blue-700' },
    { value: 'Not Qualified', label: 'Not Qualified', color: 'bg-red-600 hover:bg-red-700' },
    { value: 'Absent', label: 'Absent', color: 'bg-gray-600 hover:bg-gray-700' },
    { value: 'Excused', label: 'Excused', color: 'bg-yellow-600 hover:bg-yellow-700' },
    { value: 'Withdrawn', label: 'Withdrawn', color: 'bg-purple-600 hover:bg-purple-700' }
  ];

  return (
    <div className={cn('min-h-screen bg-background', className)}>
      <div className="container mx-auto px-6 pt-6 pb-8 max-w-4xl space-y-8">
        {/* Dog Information Card - Apple Design */}
        <div className="apple-dog-info-card">
          <div className="apple-dog-info-content">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                {/* Large Armband Number */}
                <div className="apple-armband-display">
                  <div className="text-3xl font-bold">#{displayInfo.armband}</div>
                </div>
                
                {/* Dog & Handler Info */}
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Dog className="h-5 w-5 text-white/90" />
                    <span className="text-xl font-semibold text-white">{displayInfo.dogName}</span>
                  </div>
                  <div className="text-white/80 text-sm font-medium">{displayInfo.dogBreed}</div>
                  <div className="flex items-center space-x-2 text-white/80">
                    <User className="h-4 w-4" />
                    <span className="text-sm font-medium">{displayInfo.handlerName}</span>
                  </div>
                </div>
              </div>
              
              {/* Status Indicators */}
              <div className="text-right space-y-2">
                <div className="flex items-center space-x-2 text-white/90">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-mono font-medium">
                    {result.searchTime ? msToDisplay(result.searchTime, 'hundredths') : '00:00.00'}
                  </span>
                </div>
                {result.qualification === 'Qualified' && (result.faults ?? 0) > 0 && (
                  <div className="text-yellow-200 text-sm font-medium">
                    {result.faults} fault{result.faults !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Timer Section */}
        <div className="apple-card">
          <div className="apple-card-header">
            <div className="apple-card-title">
              <Clock className="h-5 w-5 text-primary" />
              <span>Timer</span>
            </div>
            <p className="apple-card-description">
              Start timer when dog begins search. Time will auto-populate when stopped.
            </p>
          </div>
          <div className="apple-card-content">
            <DualTimerDisplay
              maxTimeMs={maxTimeMs}
              level={classConfig.level as 'Novice' | 'Advanced' | 'Excellent' | 'Masters'}
              onTimeWarning={handleTimeWarning}
              onTimeExpired={handleTimeExpired}
              onSearchTime={handleSearchTime}
              size="large"
              disabled={result.qualification === 'Absent' || result.qualification === 'Withdrawn'}
            />
          </div>
        </div>

        {/* Qualification Selection */}
        <div className="apple-card">
          <div className="apple-card-header">
            <div className="apple-card-title">
              <Award className="h-5 w-5 text-primary" />
              <span>Qualification</span>
            </div>
            <p className="apple-card-description">
              Select the result for this run
            </p>
          </div>
          <div className="apple-card-content">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {qualificationOptions.map((option) => {
                const isSelected = result.qualification === option.value;
                const getButtonClasses = () => {
                  if (isSelected) {
                    switch (option.value) {
                      case 'Qualified':
                        return 'apple-button-qualified selected';
                      case 'Not Qualified':
                        return 'apple-button-nq selected';
                      case 'Absent':
                        return 'apple-button-absent selected';
                      case 'Excused':
                        return 'apple-button-excused selected';
                      case 'Withdrawn':
                        return 'apple-button-withdrawn selected';
                      default:
                        return 'apple-button-default selected';
                    }
                  }
                  return 'apple-button-qualification';
                };
                
                return (
                  <button
                    key={option.value}
                    onClick={() => handleQualificationChange(option.value)}
                    className={getButtonClasses()}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {/* Time exceeded warning */}
            {(result.searchTime ?? 0) > 0 && isTimeExpired(result.searchTime ?? 0, maxTimeMs) && (
              <div className="apple-alert apple-alert-warning mt-6">
                <div className="apple-alert-content">
                  Time limit exceeded. Dog automatically Not Qualified.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progressive Fault Counter - Only shown if Qualified */}
        {result.qualification === 'Qualified' && (
          <div className="apple-card">
            <div className="apple-card-header">
              <div className="apple-card-title">
                <span>Faults</span>
              </div>
              <p className="apple-card-description">
                Number of faults observed during the search
              </p>
            </div>
            <div className="apple-card-content">
              <div className="apple-fault-counter">
                <button
                  onClick={handleFaultDecrement}
                  disabled={result.faults === 0}
                  className="apple-fault-button apple-fault-button-decrement"
                >
                  <span className="apple-fault-button-text">−</span>
                </button>
                
                <div className="apple-fault-display">
                  <div className="apple-fault-number">
                    {result.faults}
                  </div>
                  <div className="apple-fault-label">
                    fault{result.faults !== 1 ? 's' : ''}
                  </div>
                </div>
                
                <button
                  onClick={handleFaultIncrement}
                  className="apple-fault-button apple-fault-button-increment"
                >
                  <span className="apple-fault-button-text">+</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save/Cancel Actions */}
        <div className="apple-actions-bar">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
            className="apple-button-cancel"
          >
            Cancel
          </Button>
          
          <div className="flex items-center space-x-3">
            {saveError && (
              <span className="apple-error-text">{saveError}</span>
            )}
            <Button
              onClick={handleSaveClick}
              disabled={!isResultComplete || isSaving}
              className="apple-button-primary min-w-[120px]"
            >
              {isSaving ? 'Saving...' : 'Save Result'}
            </Button>
          </div>
        </div>
      </div>

      {/* Save Confirmation Dialog */}
      {showConfirmation && (
        <SaveConfirmationDialog
          result={result as ScentWorkResult}
          entry={entry as ScentWorkEntry}
          onConfirm={handleConfirmSave}
          onCancel={() => setShowConfirmation(false)}
          isLoading={isSaving}
        />
      )}
    </div>
  );
}

/**
 * Save Confirmation Dialog Component
 * 
 * Shows a summary of the result before final submission,
 * matching the Flutter app's confirmation pattern.
 */
interface SaveConfirmationDialogProps {
  result: ScentWorkResult;
  entry: ScentWorkEntry;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function SaveConfirmationDialog({
  result,
  entry,
  onConfirm,
  onCancel,
  isLoading
}: SaveConfirmationDialogProps) {
  return (
    <div className="apple-dialog-overlay">
      <div className="apple-dialog">
        <div className="apple-dialog-header">
          <h3 className="apple-dialog-title">Confirm Result</h3>
          <p className="apple-dialog-description">
            Please review the result before saving
          </p>
        </div>
        
        <div className="apple-dialog-content">
          {/* Summary */}
          <div className="apple-result-summary">
            <div className="apple-summary-row">
              <span className="apple-summary-label">Armband:</span>
              <span className="apple-summary-value">#{entry.displayInfo.armband}</span>
            </div>
            <div className="apple-summary-row">
              <span className="apple-summary-label">Dog:</span>
              <span className="apple-summary-value">{entry.displayInfo.dogName}</span>
            </div>
            <div className="apple-summary-row">
              <span className="apple-summary-label">Time:</span>
              <span className="apple-summary-value apple-summary-time">
                {msToDisplay(result.searchTime, 'hundredths')}
              </span>
            </div>
            <div className="apple-summary-row">
              <span className="apple-summary-label">Result:</span>
              <div className={cn(
                'apple-summary-badge',
                result.qualification === 'Qualified' ? 'qualified' : 'not-qualified'
              )}>
                {result.qualification}
              </div>
            </div>
            {result.qualification === 'Qualified' && result.faults > 0 && (
              <div className="apple-summary-row">
                <span className="apple-summary-label">Faults:</span>
                <span className="apple-summary-value">{result.faults}</span>
              </div>
            )}
          </div>

          <div className="apple-dialog-separator"></div>

          {/* Actions */}
          <div className="apple-dialog-actions">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
              className="apple-button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              className="apple-button-primary"
            >
              {isLoading ? 'Saving...' : 'Confirm'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}