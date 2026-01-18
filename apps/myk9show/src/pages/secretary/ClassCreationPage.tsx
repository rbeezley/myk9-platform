import React, { useState, useEffect, startTransition } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClassCreationStore } from '@/store/classCreationStore';
import { ClassTemplate, ClassDefinition, CreatedClass } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { logger } from '@/services/LoggingService';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  AlertTriangle,
  Settings,
  ChevronRight,
  Save,
  Eye
} from 'lucide-react';

// Import our new components
import { OrganizationSelector } from '@/components/templates/secretary/OrganizationSelector';
import { ClassSelectionGrid } from '@/components/templates/secretary/ClassSelectionGrid';
import { ClassBatchActions } from '@/components/templates/secretary/ClassBatchActions';
import { FieldOverrideForm } from '@/components/templates/secretary/FieldOverrideForm';

interface ClassCreationPageProps {
  trialId?: string;
}

type WizardStep = 'template' | 'classes' | 'overrides' | 'review' | 'complete';

export const ClassCreationPage: React.FC<ClassCreationPageProps> = ({ trialId }) => {
  const { trialId: paramTrialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  
  const { 
    selectedTemplate,
    selectedClasses,
    fieldOverrides,
    selectTemplate,
    toggleClass,
    deselectAllClasses,
    updateFieldOverride,
    resetFieldOverride,
    createClasses,
    resetCreation
  } = useClassCreationStore();

  const effectiveTrialId = trialId || paramTrialId;
  
  const [currentStep, setCurrentStep] = useState<WizardStep>('template');
  const [isCreating, setIsCreating] = useState(false);
  const [createdClasses, setCreatedClasses] = useState<CreatedClass[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Reset state on mount
  useEffect(() => {
    resetCreation();
  }, [resetCreation]);

  // Validate current step
  const validateCurrentStep = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    switch (currentStep) {
      case 'template':
        if (!selectedTemplate) {
          errors.push('Please select a template');
        }
        break;
      
      case 'classes':
        if (selectedClasses.length === 0) {
          errors.push('Please select at least one class');
        }
        break;
      
      case 'overrides':
        // Validate field overrides
        if (selectedTemplate) {
          const requiredFields = selectedTemplate.fieldSpecifications.filter(f => f.required);
          requiredFields.forEach(field => {
            const value = fieldOverrides[field.fieldName];
            if (value === undefined || value === '' || value === null) {
              errors.push(`${field.displayName} is required`);
            }
          });
        }
        break;
      
      case 'review':
        if (!effectiveTrialId) {
          errors.push('Trial ID is required');
        }
        break;
    }

    return { isValid: errors.length === 0, errors };
  };

  const handleNext = () => {
    const { isValid, errors } = validateCurrentStep();
    
    if (!isValid) {
      setValidationErrors(errors);
      return;
    }
    
    setValidationErrors([]);
    
    const steps: WizardStep[] = ['template', 'classes', 'overrides', 'review'];
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const handlePrevious = () => {
    const steps: WizardStep[] = ['template', 'classes', 'overrides', 'review'];
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const handleCreateClasses = async () => {
    if (!effectiveTrialId || !selectedTemplate) return;
    
    setIsCreating(true);
    
    try {
      const result = createClasses(effectiveTrialId);
      setCreatedClasses(result.classes);
      setCurrentStep('complete');
    } catch (error) {
      logger.error('Error creating classes:', 'pages', {}, error as Error);
      setValidationErrors(['Failed to create classes. Please try again.']);
    } finally {
      setIsCreating(false);
    }
  };

  const handleTemplateSelected = (template: ClassTemplate) => {
    selectTemplate(template.id);
  };

  const handleClassSelectionChange = (classes: ClassDefinition[]) => {
    // Clear current selections and set new ones
    deselectAllClasses();
    classes.forEach(cls => toggleClass(cls as unknown as Record<string, unknown>));
  };

  const handleBatchEdit = (fieldName: string, value: unknown) => {
    updateFieldOverride(fieldName, value);
  };

  const handleBatchCopy = () => {
    // TODO: Implement copy functionality
    logger.debug('Copy classes functionality to be implemented', 'pages', {});
  };

  const handleBatchDelete = () => {
    deselectAllClasses();
  };

  const handleExportSelection = () => {
    // TODO: Implement export functionality
    logger.debug('Export selection functionality to be implemented', 'pages', {});
  };

  const getStepProgress = () => {
    const steps: WizardStep[] = ['template', 'classes', 'overrides', 'review'];
    const currentIndex = steps.indexOf(currentStep);
    return ((currentIndex + 1) / steps.length) * 100;
  };

  const getStepStatus = (step: WizardStep) => {
    const steps: WizardStep[] = ['template', 'classes', 'overrides', 'review'];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);
    
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => startTransition(() => navigate(-1))}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-2xl font-bold">Create Classes</h1>
            <p className="text-muted-foreground">
              {effectiveTrialId ? `Trial: ${effectiveTrialId}` : 'No trial selected'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Badge variant="outline">
            Step {['template', 'classes', 'overrides', 'review'].indexOf(currentStep) + 1} of 4
          </Badge>
          <div className="w-32">
            <Progress value={getStepProgress()} />
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {[
              { id: 'template', label: 'Select Template', icon: Settings },
              { id: 'classes', label: 'Choose Classes', icon: Eye },
              { id: 'overrides', label: 'Set Values', icon: Settings },
              { id: 'review', label: 'Review & Create', icon: Check }
            ].map((step, index) => {
              const status = getStepStatus(step.id as WizardStep);
              const Icon = step.icon;
              
              return (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center gap-2">
                    <div className={`rounded-full p-3 ${
                      status === 'completed' ? 'bg-green-100 text-green-600' :
                      status === 'current' ? 'bg-blue-100 text-blue-600' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {status === 'completed' ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <div className="text-center">
                      <div className={`text-sm font-medium ${
                        status === 'current' ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {step.label}
                      </div>
                    </div>
                  </div>
                  {index < 3 && (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-red-900 mb-2">Please correct the following:</h4>
                <ul className="space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index} className="text-sm text-red-700">• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step Content */}
      <div className="space-y-6">
        {/* Step 1: Template Selection */}
        {currentStep === 'template' && (
          <OrganizationSelector
            onTemplateSelected={handleTemplateSelected}
            {...(selectedTemplate && { selectedTemplate })}
          />
        )}

        {/* Step 2: Class Selection */}
        {currentStep === 'classes' && selectedTemplate && (
          <div className="space-y-6">
            <ClassSelectionGrid
              template={selectedTemplate}
              selectedClasses={selectedClasses.filter(item => item.selected).map(item => item.classDefinition)}
              onSelectionChange={handleClassSelectionChange}
            />
            
            {selectedClasses.length > 0 && (
              <ClassBatchActions
                selectedClasses={selectedClasses.filter(item => item.selected).map(item => item.classDefinition)}
                availableFields={selectedTemplate.fieldSpecifications}
                onBatchEdit={handleBatchEdit}
                onBatchCopy={handleBatchCopy}
                onBatchDelete={handleBatchDelete}
                onExportSelection={handleExportSelection}
              />
            )}
          </div>
        )}

        {/* Step 3: Field Overrides */}
        {currentStep === 'overrides' && selectedTemplate && selectedClasses.length > 0 && (
          <FieldOverrideForm
            template={selectedTemplate}
            selectedClasses={selectedClasses.filter(item => item.selected).map(item => item.classDefinition)}
            fieldOverrides={fieldOverrides}
            onOverrideChange={updateFieldOverride}
            onResetField={resetFieldOverride}
            onResetAll={() => resetCreation()}
          />
        )}

        {/* Step 4: Review */}
        {currentStep === 'review' && selectedTemplate && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Review and Confirm</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Template Summary */}
                <div>
                  <h4 className="font-medium mb-2">Template</h4>
                  <div className="bg-muted p-3 rounded">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{selectedTemplate.templateName}</span>
                      <Badge variant={selectedTemplate.isOfficial ? "default" : "secondary"}>
                        {selectedTemplate.isOfficial ? 'Official' : 'Custom'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {selectedTemplate.organization} • {selectedTemplate.showType} • v{selectedTemplate.version}
                    </div>
                  </div>
                </div>

                {/* Selected Classes Summary */}
                <div>
                  <h4 className="font-medium mb-2">
                    Selected Classes ({selectedClasses.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {selectedClasses.map((cls, index) => (
                      <div key={index} className="bg-muted p-2 rounded text-sm">
                        <div className="font-medium">{cls.classDefinition.className}</div>
                        <div className="text-muted-foreground">
                          {cls.classDefinition.element}{cls.classDefinition.level ? ` ${cls.classDefinition.level}` : ''}{cls.classDefinition.section ? ` ${cls.classDefinition.section}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Field Overrides Summary */}
                {Object.keys(fieldOverrides).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">
                      Field Overrides ({Object.keys(fieldOverrides).length})
                    </h4>
                    <div className="bg-muted p-3 rounded space-y-2">
                      {Object.entries(fieldOverrides).map(([fieldName, value]) => {
                        const field = selectedTemplate.fieldSpecifications.find(f => f.fieldName === fieldName);
                        return field ? (
                          <div key={fieldName} className="flex justify-between text-sm">
                            <span className="font-medium">{field.displayName}:</span>
                            <span>{String(value)}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}

                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{selectedClasses.length}</div>
                    <div className="text-sm text-muted-foreground">Classes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {selectedClasses.length * (selectedTemplate.defaults?.judgingTimeEstimate || 15)}
                    </div>
                    <div className="text-sm text-muted-foreground">Minutes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      ${selectedClasses.length * (selectedTemplate.defaults?.entryFees?.preEntry || 25)}
                    </div>
                    <div className="text-sm text-muted-foreground">Revenue</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">4</div>
                    <div className="text-sm text-muted-foreground">Personnel</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 5: Complete */}
        {currentStep === 'complete' && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="p-3 bg-green-100 rounded-full mb-4">
                <Check className="h-12 w-12 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Classes Created Successfully!</h3>
              <p className="text-muted-foreground text-center mb-6">
                {createdClasses.length} classes have been created for your trial.
              </p>
              <div className="flex gap-4">
                <Button onClick={() => startTransition(() => navigate(`/trials/${effectiveTrialId}`))}>
                  View Trial
                </Button>
                <Button variant="outline" onClick={() => {
                  resetCreation();
                  setCurrentStep('template');
                  setCreatedClasses([]);
                }}>
                  Create More Classes
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Navigation */}
      {currentStep !== 'complete' && (
        <Card className="mt-6">
          <CardContent className="flex justify-between items-center py-4">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 'template'}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            <div className="text-sm text-muted-foreground">
              {selectedTemplate && `Template: ${selectedTemplate.templateName}`}
              {selectedClasses.length > 0 && ` • ${selectedClasses.length} classes selected`}
            </div>

            {currentStep === 'review' ? (
              <Button onClick={handleCreateClasses} disabled={isCreating || !effectiveTrialId}>
                {isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Create Classes
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};