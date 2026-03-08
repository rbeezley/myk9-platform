/**
 * OfflineClassSelectionStep - Enhanced class selection with offline validation and limit checking
 * Provides real-time feedback on class capacity, eligibility, and validation issues
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Info, CheckCircle2, AlertTriangle, Clock, DollarSign, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
// import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useOfflineEntryCreation } from '@/hooks/useOfflineEntryCreation';
import { ClassSelectionData } from '@/types/show-registration-types';
import { Dog } from '@/types/dog-types';
import { Class } from '@/types/show-types';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
// import { EntryLimitChecker, type LimitCheckContext } from '@/services/entries/EntryLimitChecker';

interface OfflineClassSelectionStepProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  onSelectionChange: (selections: ClassSelectionData[]) => void;
  showId: string;
}

interface ClassWithValidation {
  classData: Class;
  trial: {
    id: string;
    name: string;
    date: string;
  };
  stats: {
    confirmed: number;
    waitlisted: number;
    total: number;
    capacity: number | null;
    availableSpots: number | null;
    isFull: boolean;
  };
  validation: {
    isValid: boolean;
    errors: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info' }>;
    warnings: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info' }>;
  } | null;
  dogEligibility: Record<
    string,
    {
      eligible: boolean;
      reasons: string[];
      warnings: string[];
    }
  >;
}

export const OfflineClassSelectionStep: React.FC<OfflineClassSelectionStepProps> = ({
  selectedDogs,
  classSelections,
  onSelectionChange,
  showId,
}) => {
  const { dogs } = useDogStoreCompat();
  const { shows } = useShowStore();
  const { checkLimits, getClassStats, validateEntry, isValidating } = useOfflineEntryCreation();

  const [classesWithValidation, setClassesWithValidation] = useState<ClassWithValidation[]>([]);
  const [activeTab, setActiveTab] = useState(selectedDogs[0] || '');
  const [validationCache, setValidationCache] = useState<
    Map<string, { eligible: boolean; reasons: string[]; warnings: string[] }>
  >(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const show = shows.find(s => s.id === showId);

  // Memoize classes data to prevent unnecessary re-renders
  const classesData = useMemo(() => {
    if (!show?.trials) return [];

    const classes: ClassWithValidation[] = [];

    show.trials.forEach(trial => {
      trial.classes?.forEach(classData => {
        const stats = getClassStats(classData.id);

        classes.push({
          classData,
          trial: {
            id: trial.id,
            name: trial.name,
            date: trial.date,
          },
          stats,
          validation: null,
          dogEligibility: {},
        });
      });
    });

    return classes;
  }, [show, getClassStats]);

  // Validate eligibility for each dog-class combination
  const validateDogClassEligibility = useCallback(
    async (
      dogId: string,
      classData: Class
    ): Promise<{ eligible: boolean; reasons: string[]; warnings: string[] }> => {
      const cacheKey = `${dogId}-${classData.id}`;
      const cached = validationCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      try {
        const dog = dogs.find(d => d.id === dogId);
        if (!dog) return { eligible: false, reasons: ['Dog not found'], warnings: [] };

        // Create mock entry data for validation
        const mockEntryData = {
          showId,
          classId: classData.id,
          dogId,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: dog.ownerName || 'Unknown Handler',
            handlerId: dog.ownerId,
            entryFee: classData.entryFee || 0,
            paymentStatus: 'pending' as const,
          },
        };

        const [limitCheck, validation] = await Promise.all([
          checkLimits(mockEntryData),
          validateEntry(mockEntryData),
        ]);

        const result = {
          eligible: limitCheck.isAllowed && validation.success,
          reasons: [
            ...limitCheck.errors.map(e => e.message),
            ...validation.errors.map(e => e.message),
          ],
          warnings: [
            ...limitCheck.warnings.map(w => w.message),
            ...validation.warnings.map(w => w.message),
          ],
        };

        // Cache the result
        setValidationCache(prev => new Map(prev).set(cacheKey, result));

        return result;
      } catch {
        // Removed unused parameter
        return {
          eligible: false,
          reasons: ['Validation error'],
          warnings: [],
        };
      }
    },
    [dogs, showId, checkLimits, validateEntry, validationCache]
  );

  // Update classes with validation data
  useEffect(() => {
    const updateClassValidation = async () => {
      if (!classesData.length || selectedDogs.length === 0) {
        setClassesWithValidation(classesData);
        return;
      }

      setIsRefreshing(true);

      const updatedClasses = await Promise.all(
        classesData.map(async classWithTrial => {
          const dogEligibility: Record<
            string,
            {
              eligible: boolean;
              reasons: string[];
              warnings: string[];
            }
          > = {};

          // Check eligibility for each selected dog
          await Promise.all(
            selectedDogs.map(async dogId => {
              dogEligibility[dogId] = await validateDogClassEligibility(
                dogId,
                classWithTrial.classData
              );
            })
          );

          return {
            ...classWithTrial,
            dogEligibility,
          };
        })
      );

      setClassesWithValidation(updatedClasses);
      setIsRefreshing(false);
    };

    updateClassValidation();
  }, [classesData, selectedDogs, validateDogClassEligibility]);

  const getDogById = (dogId: string): Dog | undefined => {
    return dogs.find(d => d.id === dogId);
  };

  const getSelectionForDog = (dogId: string): ClassSelectionData => {
    return (
      classSelections.find(s => s.dogId === dogId) || {
        dogId,
        trialId: '',
        selectedClasses: [],
      }
    );
  };

  const handleClassToggle = useCallback(
    (dogId: string, trialId: string, classId: string) => {
      const updatedSelections = [...classSelections];
      let dogSelection = updatedSelections.find(s => s.dogId === dogId);

      if (!dogSelection) {
        dogSelection = { dogId, trialId, selectedClasses: [] };
        updatedSelections.push(dogSelection);
      }

      const classIndex = dogSelection.selectedClasses.findIndex(c => c.classId === classId);

      if (classIndex >= 0) {
        // Remove class
        dogSelection.selectedClasses.splice(classIndex, 1);
      } else {
        // Add class
        dogSelection.selectedClasses.push({ classId });
        dogSelection.trialId = trialId; // Update trial ID
      }

      // Remove empty selections
      const filteredSelections = updatedSelections.filter(s => s.selectedClasses.length > 0);

      onSelectionChange(filteredSelections);
    },
    [classSelections, onSelectionChange]
  );

  const handleJumpHeightChange = useCallback(
    (dogId: string, classId: string, jumpHeight: string) => {
      const updatedSelections = [...classSelections];
      const dogSelection = updatedSelections.find(s => s.dogId === dogId);

      if (dogSelection) {
        const classSelection = dogSelection.selectedClasses.find(c => c.classId === classId);
        if (classSelection) {
          classSelection.jumpHeight = jumpHeight;
          onSelectionChange(updatedSelections);
        }
      }
    },
    [classSelections, onSelectionChange]
  );

  const isClassSelected = (dogId: string, classId: string): boolean => {
    const dogSelection = getSelectionForDog(dogId);
    return dogSelection.selectedClasses.some(c => c.classId === classId);
  };

  const renderCapacityIndicator = (stats: ClassWithValidation['stats']) => {
    if (!stats.capacity) return null;

    const percentage = (stats.confirmed / stats.capacity) * 100;
    // const color = percentage >= 100 ? 'bg-red-500' : percentage >= 90 ? 'bg-yellow-500' : 'bg-green-500';  // Unused variable

    return (
      <div className="flex items-center gap-2 text-xs">
        <Progress value={percentage} className="w-16 h-2" />
        <span className="text-muted-foreground">
          {stats.confirmed}/{stats.capacity}
        </span>
        {stats.waitlisted > 0 && (
          <Badge variant="outline" className="text-xs">
            {stats.waitlisted} waitlisted
          </Badge>
        )}
      </div>
    );
  };

  const renderEligibilityStatus = (
    _dogId: string,
    eligibility: { eligible: boolean; warnings: string[]; reasons: string[] }
  ) => {
    if (eligibility.eligible) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Eligible for entry</p>
              {eligibility.warnings.length > 0 && (
                <div className="mt-1">
                  {eligibility.warnings.map((warning, idx) => (
                    <p key={idx} className="text-xs text-yellow-600">
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Not eligible</p>
            <div className="mt-1">
              {eligibility.reasons.map((reason: string, idx: number) => (
                <p key={idx} className="text-xs text-red-600">
                  {reason}
                </p>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const renderClassCard = (classWithTrial: ClassWithValidation, dogId: string) => {
    const { classData, trial, stats, dogEligibility } = classWithTrial;
    const isSelected = isClassSelected(dogId, classData.id);
    const eligibility = dogEligibility[dogId];
    const dog = getDogById(dogId);

    if (!dog || !eligibility) return null;

    return (
      <Card
        key={classData.id}
        className={cn(
          'transition-all duration-200 cursor-pointer hover:shadow-md',
          isSelected && 'ring-2 ring-primary bg-primary/5',
          !eligibility.eligible && 'opacity-60'
        )}
        onClick={() => {
          if (eligibility.eligible || stats.isFull) {
            handleClassToggle(dogId, trial.id, classData.id);
          }
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Checkbox
                  checked={isSelected}
                  disabled={!eligibility.eligible && !stats.isFull}
                  onChange={() => {}}
                />
                <CardTitle className="text-sm font-medium">{classData.name}</CardTitle>
                {renderEligibilityStatus(dogId, eligibility)}
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {trial.name} - {trial.date}
                </div>

                {classData.entryFee && (
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {formatCurrency(classData.entryFee)}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              {renderCapacityIndicator(stats)}

              {stats.isFull && (
                <Badge variant="destructive" className="text-xs">
                  Full
                </Badge>
              )}

              {eligibility.warnings.length > 0 && (
                <Badge variant="outline" className="text-xs text-yellow-600">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Warning
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        {classData.description && (
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">{classData.description}</p>
          </CardContent>
        )}

        {/* Jump height selection for selected classes */}
        {isSelected && classData.jumpHeights && classData.jumpHeights.length > 0 && (
          <CardContent className="pt-0 border-t">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Jump Height</Label>
              <Select
                value={
                  getSelectionForDog(dogId).selectedClasses.find(c => c.classId === classData.id)
                    ?.jumpHeight || ''
                }
                onValueChange={value => handleJumpHeightChange(dogId, classData.id, value)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select height" />
                </SelectTrigger>
                <SelectContent>
                  {classData.jumpHeights.map(height => (
                    <SelectItem key={height} value={height} className="text-xs">
                      {height}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const renderDogTab = (dogId: string) => {
    const dog = getDogById(dogId);
    if (!dog) return null;

    const dogSelections = getSelectionForDog(dogId);
    const selectedCount = dogSelections.selectedClasses.length;

    // Group classes by trial
    const trialGroups = new Map();
    classesWithValidation.forEach(classWithTrial => {
      const trialId = classWithTrial.trial.id;
      if (!trialGroups.has(trialId)) {
        trialGroups.set(trialId, {
          trial: classWithTrial.trial,
          classes: [],
        });
      }
      trialGroups.get(trialId).classes.push(classWithTrial);
    });

    return (
      <TabsContent key={dogId} value={dogId} className="space-y-4">
        {/* Dog header with selection summary */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div>
            <h3 className="font-medium">{dog.name}</h3>
            <p className="text-sm text-muted-foreground">
              {dog.breed} • {selectedCount} class{selectedCount !== 1 ? 'es' : ''} selected
            </p>
          </div>

          {selectedCount > 0 && (
            <Badge variant="secondary">
              Total:{' '}
              {formatCurrency(
                dogSelections.selectedClasses.reduce((sum, selection) => {
                  const classData = classesWithValidation.find(
                    c => c.classData.id === selection.classId
                  )?.classData;
                  return sum + (classData?.entryFee || 0);
                }, 0)
              )}
            </Badge>
          )}
        </div>

        {/* Trials and classes */}
        <div className="space-y-6">
          {Array.from(trialGroups.values()).map(({ trial, classes }) => (
            <div key={trial.id}>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                {trial.name}
                <Badge variant="outline" className="text-xs">
                  {trial.date}
                </Badge>
              </h4>

              <div className="grid gap-3">
                {classes.map((classWithTrial: ClassWithValidation) =>
                  renderClassCard(classWithTrial, dogId)
                )}
              </div>
            </div>
          ))}
        </div>
      </TabsContent>
    );
  };

  // Loading state
  if (isRefreshing || isValidating) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Validating class eligibility...</p>
        </div>
      </div>
    );
  }

  if (!show) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Show information not found. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  if (selectedDogs.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>Please select dogs first before choosing classes.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Select Classes</h3>
          <p className="text-sm text-muted-foreground">
            Choose classes for each selected dog. Real-time validation is provided.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setValidationCache(new Map());
            setIsRefreshing(true);
          }}
          disabled={isRefreshing}
        >
          Refresh
        </Button>
      </div>

      {/* Dog tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList
          className="grid w-full"
          style={{ gridTemplateColumns: `repeat(${selectedDogs.length}, 1fr)` }}
        >
          {selectedDogs.map(dogId => {
            const dog = getDogById(dogId);
            const selections = getSelectionForDog(dogId);

            return (
              <TabsTrigger key={dogId} value={dogId} className="text-xs">
                {dog?.name}
                {selections.selectedClasses.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {selections.selectedClasses.length}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {selectedDogs.map(dogId => renderDogTab(dogId))}
      </Tabs>
    </div>
  );
};
