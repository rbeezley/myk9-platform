import React, { useState, useMemo } from 'react';
import { ClassTemplate, ClassDefinition } from '@/types/template.types';
import { TrialClass } from '@/components/trials/types/trial.types';
import { SimpleClassSelector } from '@/components/templates/secretary/SimpleClassSelector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useShowStore } from '@/store/showStore';
import { logger } from '@/services/LoggingService';
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  User,
} from 'lucide-react';

interface ClassJudgeAssignment {
  classId: string;
  judgeId: string;
  judgeName: string;
}

interface AddClassesToTrialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    selectedClasses: ClassDefinition[],
    template: ClassTemplate,
    judgeAssignments: ClassJudgeAssignment[]
  ) => void;
  availableTemplates: ClassTemplate[];
  trialName?: string | undefined;
  trialOrganization?: string | undefined; // Filter templates by trial's organization
  existingClasses?: TrialClass[] | undefined; // Classes already in the trial to prevent duplicates
  showId?: string | undefined; // For accessing assigned judges
}

type Step = 'template' | 'classes' | 'confirmation';

export const AddClassesToTrialDialog: React.FC<AddClassesToTrialDialogProps> = ({
  open,
  onOpenChange,
  onSave,
  availableTemplates,
  trialName = 'Current Trial',
  trialOrganization,
  existingClasses = [],
  showId,
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<ClassTemplate | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<ClassDefinition[]>([]);
  const [judgeAssignments, setJudgeAssignments] = useState<Record<string, string>>({});

  // Get show data for judge assignments
  const { shows } = useShowStore();
  const currentShow = showId ? shows.find(s => s.id === showId) : null;
  const availableJudges = currentShow?.assignedJudges || [];

  // Debug logging
  logger.debug('AddClassesToTrialDialog - showId:', 'trials', { data: showId });
  logger.debug('AddClassesToTrialDialog - currentShow:', 'trials', { data: currentShow });
  logger.debug('AddClassesToTrialDialog - availableJudges:', 'trials', { data: availableJudges });

  // Filter templates to active ones and matching show type - memoized to prevent unnecessary re-renders
  const activeTemplates = useMemo(
    () =>
      availableTemplates.filter(template => {
        if (!template.isActive) return false;

        // If trial has a show type, only show matching templates
        if (trialOrganization) {
          const templateShowType =
            typeof template.showType === 'object'
              ? String(Object.values(template.showType)[0] || '')
              : String(template.showType || '');

          // Normalize comparison (case-insensitive, handle variations)
          const normalizedTrialType = (trialOrganization || '').toLowerCase().trim();
          const normalizedTemplateType = templateShowType.toLowerCase().trim();

          return (
            normalizedTrialType === normalizedTemplateType ||
            normalizedTrialType.includes(normalizedTemplateType) ||
            normalizedTemplateType.includes(normalizedTrialType)
          );
        }

        return true; // Show all if no trial show type specified
      }),
    [availableTemplates, trialOrganization]
  );

  // Track dialog open state and active templates for render-time sync
  const dialogKey = `${open}-${activeTemplates.length}-${activeTemplates.map(t => t.id).join(',')}`;
  const [prevDialogKey, setPrevDialogKey] = useState(dialogKey);
  if (dialogKey !== prevDialogKey) {
    setPrevDialogKey(dialogKey);
    if (open) {
      // If there's only one active template, auto-select it and go to step 2
      if (activeTemplates.length === 1) {
        setSelectedTemplateId(activeTemplates[0].id);
        setSelectedTemplate(activeTemplates[0]);
        setCurrentStep('classes');
      } else {
        setCurrentStep('template');
        setSelectedTemplateId('');
        setSelectedTemplate(null);
      }
      setSelectedClasses([]);
      setJudgeAssignments({});
    }
  }

  // Update selected template when ID changes using render-time sync
  const [prevSelectedTemplateId, setPrevSelectedTemplateId] = useState(selectedTemplateId);
  if (selectedTemplateId !== prevSelectedTemplateId) {
    setPrevSelectedTemplateId(selectedTemplateId);
    if (selectedTemplateId) {
      const template = activeTemplates.find(t => t.id === selectedTemplateId);
      setSelectedTemplate(template || null);
    } else {
      setSelectedTemplate(null);
    }
  }

  const handleNext = () => {
    if (currentStep === 'template' && selectedTemplate) {
      setCurrentStep('classes');
    } else if (currentStep === 'classes' && selectedClasses.length > 0) {
      setCurrentStep('confirmation');
    }
  };

  const handleBack = () => {
    if (currentStep === 'classes') {
      setCurrentStep('template');
    } else if (currentStep === 'confirmation') {
      setCurrentStep('classes');
    }
  };

  const handleSave = () => {
    if (selectedTemplate && selectedClasses.length > 0) {
      // Convert judge assignments to ClassJudgeAssignment format
      const judgeAssignmentList: ClassJudgeAssignment[] = selectedClasses
        .filter(cls => judgeAssignments[cls.className])
        .map(cls => {
          const judgeId = judgeAssignments[cls.className];
          const judge = availableJudges.find(j => j.judgeId === judgeId);
          return {
            classId: cls.className,
            judgeId,
            judgeName: judge?.judgeName || 'Unknown Judge',
          };
        });

      onSave(selectedClasses, selectedTemplate, judgeAssignmentList);
      onOpenChange(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'template':
        return selectedTemplate !== null;
      case 'classes':
        return selectedClasses.length > 0;
      case 'confirmation':
        return true;
      default:
        return false;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 'template':
        return 'Select Template';
      case 'classes':
        return 'Select Classes';
      case 'confirmation':
        return 'Confirm Selection';
      default:
        return '';
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 'template':
        return 'Choose a template containing the classes you want to add to this trial.';
      case 'classes':
        return `Select which classes from ${selectedTemplate?.templateName} to add to ${trialName}.`;
      case 'confirmation':
        return `Review your selection of ${selectedClasses.length} classes before adding them to ${trialName}.`;
      default:
        return '';
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'template':
        return renderTemplateSelection();
      case 'classes':
        return renderClassSelection();
      case 'confirmation':
        return renderConfirmation();
      default:
        return null;
    }
  };

  const renderTemplateSelection = () => {
    if (availableTemplates.length === 0) {
      return (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No templates are available. Please wait for templates to load or create a template
            first.
            <br />
            <small>Debug: availableTemplates.length = {availableTemplates.length}</small>
          </AlertDescription>
        </Alert>
      );
    }

    if (activeTemplates.length === 0) {
      return (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {trialOrganization
              ? `No active templates found for "${trialOrganization}" organization. Please create a template for this organization or ensure your templates are activated.`
              : 'No active templates are available. Please create a template first or ensure your templates are activated.'}
            <br />
            <small>
              Debug: activeTemplates.length = {activeTemplates.length}, availableTemplates.length ={' '}
              {availableTemplates.length}, trialOrganization = "{trialOrganization}"
            </small>
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <div className="space-y-6">
        <>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Available Templates</label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {activeTemplates.map(template => {
                    // Safely render template information - handle enum objects properly
                    const orgValue =
                      typeof template.organization === 'object'
                        ? String(Object.values(template.organization)[0] || 'Unknown')
                        : String(template.organization || 'Unknown');
                    const showTypeValue =
                      typeof template.showType === 'object'
                        ? String(Object.values(template.showType)[0] || 'Unknown')
                        : String(template.showType || 'Unknown');
                    const templateName = template.templateName || 'Unnamed Template';

                    return (
                      <SelectItem key={template.id} value={template.id}>
                        {templateName} ({orgValue} - {showTypeValue})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedTemplate && (
            <div className="apple-template-card">
              <div className="apple-template-header">
                <div className="apple-template-title-section">
                  <FileText className="apple-template-icon" />
                  <h3 className="apple-template-title">
                    {selectedTemplate.templateName || 'Unnamed Template'}
                  </h3>
                </div>
              </div>

              <div className="apple-template-content">
                <div className="apple-template-details">
                  <div className="apple-template-detail-item">
                    <span className="apple-template-label">Organization:</span>
                    <span className="apple-template-value">
                      {typeof selectedTemplate.organization === 'object'
                        ? String(Object.values(selectedTemplate.organization)[0] || 'Unknown')
                        : String(selectedTemplate.organization || 'Unknown')}
                    </span>
                  </div>
                  <div className="apple-template-detail-item">
                    <span className="apple-template-label">Show Type:</span>
                    <span className="apple-template-value">
                      {typeof selectedTemplate.showType === 'object'
                        ? String(Object.values(selectedTemplate.showType)[0] || 'Unknown')
                        : String(selectedTemplate.showType || 'Unknown')}
                    </span>
                  </div>
                  <div className="apple-template-detail-item">
                    <span className="apple-template-label">Version:</span>
                    <span className="apple-template-value">
                      {selectedTemplate.version || 'N/A'}
                    </span>
                  </div>
                  <div className="apple-template-detail-item">
                    <span className="apple-template-label">Classes Available:</span>
                    <span className="apple-template-value">
                      {selectedTemplate.classDefinitions?.length || 0} classes
                    </span>
                  </div>
                </div>

                {selectedTemplate.description && (
                  <div className="apple-template-description">
                    <span className="apple-template-description-label">Description:</span>
                    <p className="apple-template-description-text">
                      {selectedTemplate.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      </div>
    );
  };

  const renderClassSelection = () => {
    if (!selectedTemplate) return null;

    return (
      <div className="space-y-4">
        <SimpleClassSelector
          template={selectedTemplate}
          selectedClasses={selectedClasses}
          onSelectionChange={setSelectedClasses}
          existingClasses={existingClasses}
          availableJudges={availableJudges}
          judgeAssignments={judgeAssignments}
          onJudgeAssignmentChange={setJudgeAssignments}
        />
      </div>
    );
  };

  const renderConfirmation = () => {
    if (!selectedTemplate || selectedClasses.length === 0) return null;

    const estimatedTime =
      selectedClasses.length * (selectedTemplate.defaults?.judgingTimeEstimate || 15);

    // Group classes by element for better display
    const classesByElement = selectedClasses.reduce(
      (acc, cls) => {
        if (!acc[cls.element]) acc[cls.element] = [];
        acc[cls.element].push(cls);
        return acc;
      },
      {} as Record<string, ClassDefinition[]>
    );

    return (
      <div className="apple-confirmation-container">
        {/* Summary Cards */}
        <div className="apple-confirmation-summary">
          <div className="apple-summary-card">
            <div className="apple-summary-icon apple-summary-icon-classes">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div className="apple-summary-content">
              <div className="apple-summary-number">{selectedClasses.length}</div>
              <div className="apple-summary-label">Classes Selected</div>
            </div>
          </div>

          <div className="apple-summary-card">
            <div className="apple-summary-icon apple-summary-icon-time">
              <Clock className="h-6 w-6" />
            </div>
            <div className="apple-summary-content">
              <div className="apple-summary-number">{estimatedTime} min</div>
              <div className="apple-summary-label">Est. Judging Time</div>
              <div className="apple-summary-note">Setup time not included</div>
            </div>
          </div>

          <div className="apple-summary-card">
            <div className="apple-summary-icon apple-summary-icon-template">
              <FileText className="h-6 w-6" />
            </div>
            <div className="apple-summary-content">
              <div className="apple-summary-text">{selectedTemplate.templateName}</div>
              <div className="apple-summary-label">Template Used</div>
            </div>
          </div>
        </div>

        {/* Selected Classes */}
        <div className="apple-confirmation-classes">
          <div className="apple-confirmation-header">
            <h3 className="apple-confirmation-title">Selected Classes</h3>
            <div className="apple-confirmation-subtitle">
              Review your selection before adding to the trial
            </div>
          </div>

          <div className="apple-classes-by-element">
            {Object.entries(classesByElement).map(([element, classes]) => (
              <div key={element} className="apple-element-group">
                <div className="apple-element-header">
                  <div className="apple-element-badge">{element}</div>
                  <div className="apple-element-count">
                    {classes.length} class{classes.length !== 1 ? 'es' : ''}
                  </div>
                </div>

                <div className="apple-classes-grid">
                  {classes.map((cls, index) => {
                    // Find judge assignment for this class from the state object
                    const judgeId = judgeAssignments[cls.className];
                    const judge = judgeId ? availableJudges.find(j => j.judgeId === judgeId) : null;
                    const judgeName = judge?.judgeName;

                    return (
                      <div key={index} className="apple-class-item">
                        <div className="apple-class-check">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <div className="apple-class-info">
                          <div className="apple-class-name">
                            {cls.level || element}
                            {cls.section && (
                              <span className="apple-class-section">{cls.section}</span>
                            )}
                          </div>
                          {judgeName && (
                            <div className="apple-class-judge">
                              <User className="h-3 w-3" />
                              <span>{judgeName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{getStepTitle()}</DialogTitle>
          <DialogDescription>{getStepDescription()}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-hidden flex flex-col w-full">
          {/* Step Content - Scrollable area */}
          <div className="flex-1 overflow-y-auto pr-2">{renderStepContent()}</div>

          {/* Custom Footer with Navigation - Always visible */}
          <div
            className="flex-shrink-0 flex items-center justify-between pt-6 mt-4 px-6 pb-4"
            style={{ borderTop: 'none' }}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Step {currentStep === 'template' ? '1' : currentStep === 'classes' ? '2' : '3'} of 3
              </span>
              {currentStep === 'classes' && selectedClasses.length > 0 && (
                <span>• {selectedClasses.length} classes selected</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>

              {currentStep !== 'template' && (
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}

              {currentStep !== 'confirmation' ? (
                <Button onClick={handleNext} disabled={!canProceed()}>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleSave}>Add Classes to Trial</Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddClassesToTrialDialog;
