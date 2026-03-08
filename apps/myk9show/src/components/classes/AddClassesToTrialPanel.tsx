import React, { useState, useMemo } from 'react';
import { ClassTemplate, ClassDefinition } from '@/types/template.types';
import { TrialClass } from '@/components/trials/types/trial.types';
import { SimpleClassSelector } from '@/components/templates/secretary/SimpleClassSelector';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { useShowStore } from '@/store/showStore';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { TemplateSelectionStep } from './AddClassesToTrialPanelSteps';
import { ConfirmationStep } from './AddClassesToTrialPanelSteps';

interface ClassJudgeAssignment {
  classId: string;
  judgeId: string;
  judgeName: string;
}

interface AddClassesToTrialPanelProps {
  open: boolean;
  onClose: () => void;
  onSave: (
    selectedClasses: ClassDefinition[],
    template: ClassTemplate,
    judgeAssignments: ClassJudgeAssignment[]
  ) => void;
  availableTemplates: ClassTemplate[];
  trialName?: string | undefined;
  trialOrganization?: string | undefined;
  existingClasses?: TrialClass[] | undefined;
  showId?: string | undefined;
}

type Step = 'template' | 'classes' | 'confirmation';

const STEP_TITLES: Record<Step, string> = {
  template: 'Select Template',
  classes: 'Select Classes',
  confirmation: 'Confirm Selection',
};

const STEP_NUMBER: Record<Step, number> = {
  template: 1,
  classes: 2,
  confirmation: 3,
};

export const AddClassesToTrialPanel: React.FC<AddClassesToTrialPanelProps> = ({
  open,
  onClose,
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

  const { shows } = useShowStore();
  const currentShow = showId ? shows.find(s => s.id === showId) : null;
  const availableJudges = currentShow?.assignedJudges || [];

  // Filter templates to active ones matching show type
  const activeTemplates = useMemo(
    () =>
      availableTemplates.filter(template => {
        if (!template.isActive) return false;

        if (trialOrganization) {
          const templateShowType =
            typeof template.trialType === 'object'
              ? String(Object.values(template.trialType)[0] || '')
              : String(template.trialType || '');

          const normalizedTrialType = (trialOrganization || '').toLowerCase().trim();
          const normalizedTemplateType = templateShowType.toLowerCase().trim();

          return (
            normalizedTrialType === normalizedTemplateType ||
            normalizedTrialType.includes(normalizedTemplateType) ||
            normalizedTemplateType.includes(normalizedTrialType)
          );
        }

        return true;
      }),
    [availableTemplates, trialOrganization]
  );

  // Reset state when panel opens/closes or templates change
  const dialogKey = `${open}-${activeTemplates.length}-${activeTemplates.map(t => t.id).join(',')}`;
  const [prevDialogKey, setPrevDialogKey] = useState(dialogKey);
  if (dialogKey !== prevDialogKey) {
    setPrevDialogKey(dialogKey);
    if (open) {
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

  // Sync selected template when ID changes
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
      onClose();
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

  // Footer with step navigation
  const footer = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Step {STEP_NUMBER[currentStep]} of 3</span>
        {currentStep === 'classes' && selectedClasses.length > 0 && (
          <span>- {selectedClasses.length} classes selected</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onClose}>
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
  );

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title={STEP_TITLES[currentStep]}
      subtitle={getStepDescription()}
      size="xl"
      footer={footer}
    >
      <div className="p-6">
        {currentStep === 'template' && (
          <TemplateSelectionStep
            availableTemplates={availableTemplates}
            activeTemplates={activeTemplates}
            selectedTemplateId={selectedTemplateId}
            selectedTemplate={selectedTemplate}
            trialOrganization={trialOrganization}
            onSelectTemplate={setSelectedTemplateId}
          />
        )}
        {currentStep === 'classes' && selectedTemplate && (
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
        )}
        {currentStep === 'confirmation' && selectedTemplate && selectedClasses.length > 0 && (
          <ConfirmationStep
            selectedTemplate={selectedTemplate}
            selectedClasses={selectedClasses}
            judgeAssignments={judgeAssignments}
            availableJudges={availableJudges}
          />
        )}
      </div>
    </SlideOverPanel>
  );
};

export default AddClassesToTrialPanel;
