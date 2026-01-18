/**
 * Multi-Area Scoresheet Component
 * 
 * Comprehensive scoring interface for Interior Excellent (2 areas) and Masters (3 areas) classes.
 * Manages sequential area timing, cumulative fault tracking, and multi-area result submission.
 */

import { useState, useCallback, useMemo } from 'react';
import { ChevronLeft, Clock, User, Dog, Award, MapPin, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Custom components
import { MultiAreaTimerDisplay } from './MultiAreaTimerDisplay';
import { useMultiAreaTiming } from '@/hooks/useMultiAreaTiming';

// Types and utilities
import { logger } from '@/services/LoggingService';
import type {
  ScentWorkEntry, 
  MultiAreaScentWorkResult,
  AreaResult,
  QualificationStatus
} from '@/types/scent-work-types';
import { 
  getAreaTimeLimits, 
  validateMultiAreaScentWorkResult
} from '@/types/scent-work-types';
import { msToDisplay } from '@/lib/timeUtils';

// Props interface
export interface MultiAreaScoresheetProps {
  entry: ScentWorkEntry;
  onSave: (result: MultiAreaScentWorkResult) => Promise<void>;
  onCancel: () => void;
  onNavigateBack?: () => void;
  className?: string;
}

/**
 * Multi-area Scent Work scoresheet component
 * 
 * Features:
 * - Sequential area timing with locked progression
 * - Individual area qualification tracking
 * - Cumulative fault counter across all areas
 * - Total time limit enforcement
 * - Area-specific navigation and status
 * - Progressive disclosure matching single-area pattern
 */
export function MultiAreaScoresheet({
  entry,
  onSave,
  onCancel,
  onNavigateBack,
  className
}: MultiAreaScoresheetProps) {
  // Extract configuration
  const { classConfig, displayInfo } = entry;
  const areaTimeLimits = getAreaTimeLimits(classConfig.element, classConfig.level);
  const areaCount = areaTimeLimits.length;
  const totalTimeLimit = areaTimeLimits.reduce((sum, time) => sum + time, 0);
  
  // Initialize area results
  const [areaResults, setAreaResults] = useState<AreaResult[]>(() =>
    Array(areaCount).fill(null).map((_, index) => ({
      areaNumber: index + 1,
      searchTime: 0,
      faults: 0
    }) as AreaResult)
  );
  
  // UI state
  const [activeTab, setActiveTab] = useState('timing');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Multi-area timing hook
  const {
    currentAreaIndex,
    areaStatuses,
    areaTimes,
    totalElapsedTime,
    remainingTime,
    isRunning,
    startArea,
    completeCurrentArea,
    failCurrentArea,
    isComplete,
    hasFailed
  } = useMultiAreaTiming({
    totalTimeMs: totalTimeLimit,
    areaCount,
    level: classConfig.level,
    onAreaComplete: (areaIndex, timeMs) => {
      // Update area result with time
      setAreaResults(prev => {
        const newResults = [...prev];
        newResults[areaIndex] = {
          ...newResults[areaIndex],
          searchTime: timeMs
        };
        return newResults;
      });
    },
    onAllAreasComplete: (totalTime) => {
      logger.debug(`All areas complete. Total time: ${msToDisplay(totalTime, 'hundredths')}`, 'scoring', {});
    },
    onTimeExpired: () => {
      // Mark current area as failed due to timeout
      if (currentAreaIndex >= 0) {
        handleAreaQualification(currentAreaIndex, 'Not Qualified');
      }
    }
  });
  
  // Handle area qualification changes
  const handleAreaQualification = useCallback((areaIndex: number, qualification: QualificationStatus) => {
    setAreaResults(prev => {
      const newResults = [...prev];
      const updatedArea: AreaResult = {
        ...newResults[areaIndex],
        qualification,
        // Reset faults when changing qualification
        faults: qualification === 'Qualified' ? newResults[areaIndex].faults : 0
      };
      // Set NQ reason if not qualified
      if (qualification === 'Not Qualified') {
        updatedArea.nqReason = 'noFind';
      }
      newResults[areaIndex] = updatedArea;
      return newResults;
    });
    
    // Auto-fail area if not qualified
    if (qualification === 'Not Qualified' && areaStatuses[areaIndex] === 'active') {
      failCurrentArea();
    }
  }, [areaStatuses, failCurrentArea]);
  
  // Handle fault changes for an area
  const handleAreaFaultChange = useCallback((areaIndex: number, delta: number) => {
    setAreaResults(prev => {
      const newResults = [...prev];
      const currentFaults = newResults[areaIndex].faults || 0;
      newResults[areaIndex] = {
        ...newResults[areaIndex],
        faults: Math.max(0, Math.min(99, currentFaults + delta))
      };
      return newResults;
    });
  }, []);
  
  // Calculate overall result
  const overallResult = useMemo((): Partial<MultiAreaScentWorkResult> => {
    // All areas must be qualified for overall qualification
    const allQualified = areaResults.every(area => area.qualification === 'Qualified');
    const anyFailed = areaStatuses.some(status => status === 'failed');
    const totalFaults = areaResults.reduce((sum, area) => sum + (area.faults || 0), 0);

    const result: Partial<MultiAreaScentWorkResult> = {
      entryId: entry.id,
      classId: entry.classId,
      totalSearchTime: totalElapsedTime,
      areaResults: areaResults.map((area, index) => ({
        ...area,
        searchTime: areaTimes[index] || area.searchTime
      })),
      totalFaults,
      recordedBy: 'current-judge', // TODO: Get from auth context
      recordedAt: new Date()
    };

    // Set qualification only when determined
    if (isComplete && allQualified) {
      result.qualification = 'Qualified';
    } else if (anyFailed || hasFailed) {
      result.qualification = 'Not Qualified';
    }

    return result;
  }, [entry, areaResults, areaStatuses, areaTimes, totalElapsedTime, isComplete, hasFailed]);
  
  // Validation
  const isResultComplete = validateMultiAreaScentWorkResult(overallResult);
  
  // Save handlers
  const handleSaveClick = useCallback(() => {
    if (!isResultComplete) {
      setSaveError('Please complete all areas before saving');
      return;
    }
    setShowConfirmation(true);
    setSaveError(null);
  }, [isResultComplete]);
  
  const handleConfirmSave = useCallback(async () => {
    if (!validateMultiAreaScentWorkResult(overallResult)) {
      setSaveError('Invalid result data');
      return;
    }
    
    setIsSaving(true);
    setSaveError(null);
    
    try {
      await onSave(overallResult as MultiAreaScentWorkResult);
      setShowConfirmation(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save result');
    } finally {
      setIsSaving(false);
    }
  }, [overallResult, onSave]);
  
  // Render area scoresheet tab
  const renderAreaScoresheet = (areaIndex: number) => {
    const areaResult = areaResults[areaIndex];
    const areaStatus = areaStatuses[areaIndex];
    const isCurrentArea = currentAreaIndex === areaIndex;
    const areaTime = areaTimes[areaIndex];
    
    return (
      <div className="space-y-6">
        {/* Area Status Header */}
        <Card className={cn(
          'border-2 transition-colors',
          areaStatus === 'completed' ? 'border-green-500 bg-green-50 dark:bg-green-950' :
          areaStatus === 'failed' ? 'border-red-500 bg-red-50 dark:bg-red-950' :
          areaStatus === 'active' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' :
          'border-gray-300'
        )}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <MapPin className="h-5 w-5" />
                <span>Area {areaIndex + 1} Status</span>
              </span>
              <Badge variant={
                areaStatus === 'completed' ? 'default' :
                areaStatus === 'failed' ? 'destructive' :
                areaStatus === 'active' ? 'secondary' :
                'outline'
              }>
                {areaStatus || 'Not Started'}
              </Badge>
            </CardTitle>
            {areaTime > 0 && (
              <CardDescription>
                Time: {msToDisplay(areaTime, 'hundredths')}
              </CardDescription>
            )}
          </CardHeader>
        </Card>
        
        {/* Area Controls */}
        {areaStatus === 'locked' && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Complete previous areas to unlock Area {areaIndex + 1}
            </AlertDescription>
          </Alert>
        )}
        
        {areaStatus === 'ready' && !isCurrentArea && (
          <Card>
            <CardContent className="pt-6">
              <Button 
                onClick={() => {
                  startArea(areaIndex);
                  setActiveTab('timing');
                }}
                size="lg"
                className="w-full"
              >
                Start Area {areaIndex + 1} Timing
              </Button>
            </CardContent>
          </Card>
        )}
        
        {(areaStatus === 'active' || areaStatus === 'completed' || areaStatus === 'failed') && (
          <>
            {/* Qualification Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Award className="h-5 w-5" />
                  <span>Area {areaIndex + 1} Qualification</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant={areaResult.qualification === 'Qualified' ? 'default' : 'outline'}
                    size="lg"
                    onClick={() => handleAreaQualification(areaIndex, 'Qualified')}
                    disabled={false}
                    className={cn(
                      'h-12',
                      areaResult.qualification === 'Qualified' && 'bg-blue-600 hover:bg-blue-700'
                    )}
                  >
                    Qualified
                  </Button>
                  <Button
                    variant={areaResult.qualification === 'Not Qualified' ? 'destructive' : 'outline'}
                    size="lg"
                    onClick={() => handleAreaQualification(areaIndex, 'Not Qualified')}
                    disabled={false}
                  >
                    Not Qualified
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Progressive Fault Counter */}
            {areaResult.qualification === 'Qualified' && (
              <Card>
                <CardHeader>
                  <CardTitle>Area {areaIndex + 1} Faults</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center space-x-6">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => handleAreaFaultChange(areaIndex, -1)}
                      disabled={areaResult.faults === 0}
                      className="w-12 h-12 text-xl"
                    >
                      −
                    </Button>
                    
                    <div className="text-center">
                      <div className="text-4xl font-bold text-gray-900 dark:text-white">
                        {areaResult.faults}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        fault{areaResult.faults !== 1 ? 's' : ''}
                      </div>
                    </div>
                    
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => handleAreaFaultChange(areaIndex, 1)}
                      className="w-12 h-12 text-xl"
                    >
                      +
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Complete Area Button */}
            {areaStatus === 'active' && isCurrentArea && areaResult.qualification && (
              <Button 
                onClick={() => {
                  completeCurrentArea();
                  // Auto-advance to next area tab if available
                  if (areaIndex + 1 < areaCount) {
                    setActiveTab(`area${areaIndex + 2}`);
                  }
                }}
                size="lg"
                className="w-full"
                variant="default"
              >
                Complete Area {areaIndex + 1}
              </Button>
            )}
          </>
        )}
      </div>
    );
  };
  
  return (
    <div className={cn('min-h-screen bg-gray-50 dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {onNavigateBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onNavigateBack}
                className="p-2"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                {classConfig.element} {classConfig.level} - Multi-Area
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {areaCount} Areas • Total Time: {Math.floor(totalTimeLimit / 60000)}min
              </p>
            </div>
          </div>
          <Badge variant={overallResult.qualification === 'Qualified' ? 'default' : 'secondary'}>
            {overallResult.qualification || 'In Progress'}
          </Badge>
        </div>
      </div>
      
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Dog Information Card */}
        <Card className="bg-gradient-to-r from-purple-600 to-purple-700 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="bg-white text-purple-700 rounded-lg p-4 min-w-[80px] text-center">
                  <div className="text-3xl font-bold">#{displayInfo.armband}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Dog className="h-5 w-5" />
                    <span className="text-xl font-semibold">{displayInfo.dogName}</span>
                  </div>
                  <div className="text-purple-100">{displayInfo.dogBreed}</div>
                  <div className="flex items-center space-x-2 text-purple-100">
                    <User className="h-4 w-4" />
                    <span>{displayInfo.handlerName}</span>
                  </div>
                </div>
              </div>
              
              <div className="text-right space-y-2">
                <div className="flex items-center space-x-2 text-purple-100">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">
                    Total: {msToDisplay(totalElapsedTime, 'hundredths')}
                  </span>
                </div>
                {(overallResult.totalFaults ?? 0) > 0 && (
                  <div className="text-yellow-200 text-sm">
                    {overallResult.totalFaults} total fault{overallResult.totalFaults !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Tabbed Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="timing">Timer</TabsTrigger>
            <TabsTrigger value="area1">Area 1</TabsTrigger>
            <TabsTrigger value="area2">Area 2</TabsTrigger>
            {areaCount > 2 && <TabsTrigger value="area3">Area 3</TabsTrigger>}
          </TabsList>
          
          <TabsContent value="timing" className="mt-6">
            <MultiAreaTimerDisplay
              areaCount={areaCount}
              currentAreaIndex={currentAreaIndex}
              areaStatuses={areaStatuses}
              areaTimes={areaTimes}
              totalElapsedTime={totalElapsedTime}
              totalTimeLimit={totalTimeLimit}
              remainingTime={remainingTime}
              isRunning={isRunning}
              onStartArea={startArea}
              onCompleteArea={completeCurrentArea}
              onFailArea={failCurrentArea}
            />
          </TabsContent>
          
          <TabsContent value="area1" className="mt-6">
            {renderAreaScoresheet(0)}
          </TabsContent>
          
          <TabsContent value="area2" className="mt-6">
            {renderAreaScoresheet(1)}
          </TabsContent>
          
          {areaCount > 2 && (
            <TabsContent value="area3" className="mt-6">
              {renderAreaScoresheet(2)}
            </TabsContent>
          )}
        </Tabs>
        
        {/* Save/Cancel Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          
          <div className="flex items-center space-x-3">
            {saveError && (
              <span className="text-sm text-red-600">{saveError}</span>
            )}
            <Button
              onClick={handleSaveClick}
              disabled={!isResultComplete || isSaving}
              className="min-w-[120px]"
            >
              {isSaving ? 'Saving...' : 'Save Result'}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Save Confirmation Dialog */}
      {showConfirmation && (
        <MultiAreaSaveConfirmation
          result={overallResult as MultiAreaScentWorkResult}
          entry={entry}
          areaCount={areaCount}
          onConfirm={handleConfirmSave}
          onCancel={() => setShowConfirmation(false)}
          isLoading={isSaving}
        />
      )}
    </div>
  );
}

/**
 * Multi-Area Save Confirmation Dialog
 */
interface MultiAreaSaveConfirmationProps {
  result: MultiAreaScentWorkResult;
  entry: ScentWorkEntry;
  areaCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function MultiAreaSaveConfirmation({
  result,
  entry,
  // areaCount, // Available but not used in this dialog
  onConfirm,
  onCancel,
  isLoading
}: MultiAreaSaveConfirmationProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <Card className="w-full max-w-lg mx-4">
        <CardHeader>
          <CardTitle>Confirm Multi-Area Result</CardTitle>
          <CardDescription>
            Please review the complete result before saving
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Armband:</span>
              <span className="font-medium">#{entry.displayInfo.armband}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Dog:</span>
              <span className="font-medium">{entry.displayInfo.dogName}</span>
            </div>
            
            <Separator />
            
            {/* Area Results */}
            {result.areaResults.map((area, index) => (
              <div key={index} className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                <div className="font-medium">Area {index + 1}</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Time: {msToDisplay(area.searchTime, 'hundredths')}</div>
                  <div>
                    <Badge variant={area.qualification === 'Qualified' ? 'default' : 'secondary'} className="text-xs">
                      {area.qualification}
                    </Badge>
                  </div>
                  {area.qualification === 'Qualified' && area.faults > 0 && (
                    <div className="col-span-2">Faults: {area.faults}</div>
                  )}
                </div>
              </div>
            ))}
            
            <Separator />
            
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Total Time:</span>
              <span className="font-mono font-medium">
                {msToDisplay(result.totalSearchTime, 'hundredths')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Overall Result:</span>
              <Badge variant={result.qualification === 'Qualified' ? 'default' : 'destructive'}>
                {result.qualification}
              </Badge>
            </div>
            {result.totalFaults > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Faults:</span>
                <span className="font-medium">{result.totalFaults}</span>
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Confirm'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}