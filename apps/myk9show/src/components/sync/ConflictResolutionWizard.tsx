import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  GitBranch,
  Info,
  Lightbulb,
  Merge,
  Shield,
  User,
  Wand2,
} from 'lucide-react';
import { FieldConflictResolver } from './FieldConflictResolver';
import { cn } from '@/lib/utils';
import { Conflict } from '../../types/conflict-types';
import type { BaseConflict, BaseConflictResolution } from '@/types/conflict-types';

interface ConflictResolutionWizardProps {
  conflict: Conflict | BaseConflict<Record<string, unknown>>;
  conflictResolver?: {
    getResolutionHistory?: (entityType: string, entityId: string) => Promise<BaseConflictResolution[]>;
    suggestResolution?: (conflict: BaseConflict<Record<string, unknown>>) => { strategy: string; confidence: number } | null;
  };
  onComplete: (resolution: {
    strategy: 'local' | 'remote' | 'merge' | 'custom';
    resolvedData: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) => void;
}

interface StepComponentProps {
  conflict?: Conflict;
  fieldResolutions?: FieldResolution[];
  onFieldResolution?: (field: string, resolution: FieldResolution) => void;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<StepComponentProps>;
  canSkip?: boolean;
  isRequired?: boolean;
}

interface FieldResolution {
  field: string;
  source: 'local' | 'remote' | 'custom';
  value: unknown;
  confidence?: number;
  reason?: string;
}

export const ConflictResolutionWizard: React.FC<ConflictResolutionWizardProps> = ({
  conflict,
  conflictResolver,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [fieldResolutions, setFieldResolutions] = useState<FieldResolution[]>([]);
  const [wizardData, setWizardData] = useState<Record<string, unknown>>({});
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);

  // Normalize conflict data - support legacy formats
  const baseConflict = conflict as unknown as BaseConflict<Record<string, unknown>>;
  const localData = baseConflict.localData || {};
  const remoteData = baseConflict.remoteData || {};
  const conflictFields: string[] = baseConflict.conflictFields || Object.keys({ ...localData, ...remoteData });
  const conflictingFields = conflictFields.filter((field: string) => 
    JSON.stringify(localData[field]) !== JSON.stringify(remoteData[field])
  );

  const steps: WizardStep[] = [
    {
      id: 'overview',
      title: 'Conflict Overview',
      description: 'Review the conflicting changes and choose your resolution strategy',
      component: OverviewStep,
    },
    {
      id: 'strategy',
      title: 'Resolution Strategy',
      description: 'Select how you want to handle this conflict',
      component: StrategyStep,
    },
    {
      id: 'fields',
      title: 'Field Resolution',
      description: 'Resolve each conflicting field individually',
      component: FieldResolutionStep,
      canSkip: true,
    },
    {
      id: 'review',
      title: 'Review & Confirm',
      description: 'Review your choices before applying the resolution',
      component: ReviewStep,
    },
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  function OverviewStep() {
    /*
    const formatValue = (value: unknown): string => {
      if (value === null || value === undefined) return 'Not set';
      if (typeof value === 'object') return JSON.stringify(value, null, 2);
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (value instanceof Date) return value.toLocaleDateString();
      return String(value);
    };
    */

    const stats = {
      totalFields: conflictFields.length,
      conflictingFields: conflictingFields.length,
      identicalFields: conflictFields.length - conflictingFields.length,
    };

    return (
      <div className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This wizard will guide you through resolving the data conflict step by step.
            You can choose different strategies for different types of conflicts.
          </AlertDescription>
        </Alert>

        {/* Conflict Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.totalFields}</div>
                <div className="text-sm text-muted-foreground">Total Fields</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-warning">{stats.conflictingFields}</div>
                <div className="text-sm text-muted-foreground">Conflicting</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-success">{stats.identicalFields}</div>
                <div className="text-sm text-muted-foreground">Identical</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Entity Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conflict Details</CardTitle>
            <CardDescription>
              Changes detected in {conflict.entityType} "{conflict.entityId}"
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <span className="font-medium">Local Changes</span>
                </div>
                {'localData' in conflict && conflict.localData && (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      Modified: {conflict.lastModified?.local ? new Date(conflict.lastModified.local).toLocaleString() : 'Unknown'}
                    </div>
                    <div>By: {conflict.lastModifiedBy?.local ? String(conflict.lastModifiedBy.local) : 'Unknown'}</div>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-secondary" />
                  <span className="font-medium">Remote Changes</span>
                </div>
                {'remoteData' in conflict && conflict.remoteData && (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      Modified: {conflict.lastModified?.remote ? new Date(conflict.lastModified.remote).toLocaleString() : 'Unknown'}
                    </div>
                    <div>By: {conflict.lastModifiedBy?.remote ? String(conflict.lastModifiedBy.remote) : 'Unknown'}</div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conflicting Fields Preview */}
        {conflictingFields.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conflicting Fields</CardTitle>
              <CardDescription>
                Fields that have different values between local and remote versions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {conflictingFields.slice(0, 3).map((field: string) => (
                  <div key={field} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                    <span className="font-medium">{field}</span>
                    <Badge variant="outline" className="text-warning">
                      Needs Resolution
                    </Badge>
                  </div>
                ))}
                {conflictingFields.length > 3 && (
                  <div className="text-sm text-muted-foreground text-center">
                    ... and {conflictingFields.length - 3} more fields
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  function StrategyStep() {
    const [selectedStrategy, setSelectedStrategy] = useState<string>('');

    const strategies = [
      {
        id: 'auto',
        title: 'Automatic Resolution',
        description: 'Let the system automatically resolve conflicts using smart rules',
        icon: Wand2,
        confidence: conflictResolver ? 85 : 70,
        recommended: true,
      },
      {
        id: 'local',
        title: 'Keep All Local Changes',
        description: 'Use your local version for all conflicting fields',
        icon: User,
        confidence: 100,
        recommended: false,
      },
      {
        id: 'remote',
        title: 'Accept All Remote Changes',
        description: 'Use the remote version for all conflicting fields',
        icon: GitBranch,
        confidence: 100,
        recommended: false,
      },
      {
        id: 'manual',
        title: 'Manual Field-by-Field',
        description: 'Review and choose the value for each conflicting field',
        icon: Shield,
        confidence: 100,
        recommended: false,
      },
    ];

    React.useEffect(() => {
      setWizardData(prev => ({ ...prev, strategy: selectedStrategy }));
    }, [selectedStrategy]);

    return (
      <div className="space-y-6">
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>
            Choose how you want to resolve this conflict. You can change your approach later if needed.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4">
          {strategies.map((strategy) => (
            <motion.div
              key={strategy.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start p-6 h-auto',
                  selectedStrategy === strategy.id && 'border-primary bg-primary/5',
                  strategy.recommended && 'border-primary/50'
                )}
                onClick={() => setSelectedStrategy(strategy.id)}
              >
                <div className="flex items-start gap-4 w-full">
                  <div className={cn(
                    'p-3 rounded-lg',
                    selectedStrategy === strategy.id ? 'bg-primary/10' : 'bg-muted'
                  )}>
                    <strategy.icon className={cn(
                      'h-6 w-6',
                      selectedStrategy === strategy.id ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold">{strategy.title}</span>
                      {strategy.recommended && (
                        <Badge variant="secondary" className="text-xs">
                          Recommended
                        </Badge>
                      )}
                      {selectedStrategy === strategy.id && (
                        <CheckCircle className="h-4 w-4 text-primary ml-auto" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {strategy.description}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Confidence:</span>
                      <Progress value={strategy.confidence} className="h-1.5 w-24" />
                      <span className="text-xs font-medium">{strategy.confidence}%</span>
                    </div>
                  </div>
                </div>
              </Button>
            </motion.div>
          ))}
        </div>

        {selectedStrategy === 'auto' && conflictResolver && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Automatic resolution will analyze timestamps, data types, and business rules 
              to make intelligent choices for each conflicting field.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  function FieldResolutionStep() {
    const currentField = conflictingFields[currentFieldIndex];
    const isLastField = currentFieldIndex === conflictingFields.length - 1;

    if (!currentField) {
      return (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            All conflicting fields have been resolved! Proceed to review your choices.
          </AlertDescription>
        </Alert>
      );
    }

    const handleFieldResolve = (resolvedValue: unknown) => {
      const resolution: FieldResolution = {
        field: currentField,
        source: 'custom',
        value: resolvedValue,
      };

      setFieldResolutions(prev => [
        ...prev.filter(r => r.field !== currentField),
        resolution,
      ]);

      if (isLastField) {
        setCurrentStep(currentStep + 1);
      } else {
        setCurrentFieldIndex(currentFieldIndex + 1);
      }
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              Field {currentFieldIndex + 1} of {conflictingFields.length}
            </h3>
            <p className="text-sm text-muted-foreground">
              Resolve the conflict for each field individually
            </p>
          </div>
          <Badge variant="outline">
            {fieldResolutions.length} of {conflictingFields.length} resolved
          </Badge>
        </div>

        <Progress value={(currentFieldIndex / conflictingFields.length) * 100} className="h-2" />

        <FieldConflictResolver
          fieldName={currentField}
          localValue={localData[currentField]}
          remoteValue={remoteData[currentField]}
          onResolve={handleFieldResolve}
          suggestions={[]}
        />

        {currentFieldIndex > 0 && (
          <Button
            variant="outline"
            onClick={() => setCurrentFieldIndex(currentFieldIndex - 1)}
            className="w-full"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous Field
          </Button>
        )}
      </div>
    );
  }

  function ReviewStep() {
    const strategy = wizardData.strategy as string;
    const resolvedData = { ...localData };

    // Apply resolutions based on strategy
    if (strategy === 'local') {
      // Already using local data
    } else if (strategy === 'remote') {
      Object.keys(remoteData).forEach(key => {
        resolvedData[key] = remoteData[key];
      });
    } else if (strategy === 'auto' && conflictResolver) {
      conflictingFields.forEach((field: string) => {
        // Default to remote value for auto resolution
        resolvedData[field] = remoteData[field];
      });
    } else {
      // Manual resolutions
      fieldResolutions.forEach(resolution => {
        resolvedData[resolution.field] = resolution.value;
      });
    }

    const handleComplete = () => {
      onComplete({
        strategy: strategy === 'auto' ? 'merge' : (strategy as 'local' | 'remote' | 'custom'),
        resolvedData,
        metadata: {
          wizardCompleted: true,
          fieldResolutions: fieldResolutions.length,
          strategy,
        },
      });
    };

    return (
      <div className="space-y-6">
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Review your resolution choices below. You can go back to make changes if needed.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Resolution Summary</CardTitle>
            <CardDescription>
              Your chosen strategy and field-level decisions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Strategy:</span>
              <Badge variant="outline">{strategy}</Badge>
            </div>

            {strategy === 'manual' && (
              <div className="space-y-2">
                <span className="font-medium">Field Resolutions:</span>
                <div className="space-y-1">
                  {fieldResolutions.map((resolution) => (
                    <div key={resolution.field} className="flex items-center justify-between text-sm">
                      <span>{resolution.field}</span>
                      <Badge variant="outline" className="text-xs">
                        {resolution.source}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div>
              <span className="font-medium">Final Result Preview:</span>
              <div className="mt-2 bg-muted/30 rounded p-3 text-sm font-mono max-h-32 overflow-auto">
                <pre>{JSON.stringify(resolvedData, null, 2)}</pre>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleComplete}
          className="w-full bg-gradient-to-r from-primary to-secondary"
          size="lg"
        >
          <Merge className="h-4 w-4 mr-2" />
          Apply Resolution
        </Button>
      </div>
    );
  }

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      if (currentStep === 1 && wizardData.strategy !== 'manual') {
        // Skip field resolution for non-manual strategies
        setCurrentStep(currentStep + 2);
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{steps[currentStep].title}</h2>
            <p className="text-sm text-muted-foreground">
              {steps[currentStep].description}
            </p>
          </div>
          <Badge variant="outline">
            Step {currentStep + 1} of {steps.length}
          </Badge>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <CurrentStepComponent />
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={currentStep === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>

        {currentStep < steps.length - 1 ? (
          <Button
            onClick={nextStep}
            disabled={!wizardData.strategy && currentStep === 1}
          >
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : null}
      </div>
    </div>
  );
};