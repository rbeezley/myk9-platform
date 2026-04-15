import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, FileText, Layers, ArrowLeft } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { SimpleClassSelector } from '@/components/templates/secretary/SimpleClassSelector';
import { useWizardStore } from '@/store/wizardStore';
import { useTemplates } from '@/hooks/useTemplates';
import { ClassTemplate, ClassDefinition } from '@/types/template.types';

interface ExistingClassInfo {
  trialId: string;
  className: string;
  element: string;
  level: string;
  section: string;
}

interface ClassSelectionStepProps {
  className?: string;
  /** Classes that already exist in the DB (for add-classes mode). */
  existingDBClasses?: ExistingClassInfo[] | undefined;
  /** True once the user has clicked Next — gates eager validation errors. */
  submitted?: boolean;
}

interface TrialClassState {
  selectedTemplate: ClassTemplate | null;
  selectedClasses: ClassDefinition[];
}

export const ClassSelectionStep: React.FC<ClassSelectionStepProps> = ({
  className,
  existingDBClasses = [],
  submitted = false,
}) => {
  const { trials, updateTrial, show, judgeDetails, judgeAssignments, assignJudgeToClass } =
    useWizardStore(
      useShallow(state => ({
        trials: state.trials,
        updateTrial: state.updateTrial,
        show: state.show,
        judgeDetails: state.judgeDetails,
        judgeAssignments: state.judgeAssignments,
        assignJudgeToClass: state.assignJudgeToClass,
      }))
    );

  const { templates } = useTemplates();

  // Track user's selected trial ID (raw state)
  const [selectedTrialId, setSelectedTrialId] = useState<string>(() =>
    trials.length > 0 ? trials[0].id : ''
  );

  // Derive effective current trial ID (ensures validity)
  const currentTrialId = useMemo(() => {
    if (trials.length === 0) return '';
    // If selected trial exists, use it; otherwise fall back to first trial
    const exists = trials.some(t => t.id === selectedTrialId);
    return exists ? selectedTrialId : trials[0].id;
  }, [trials, selectedTrialId]);

  // Track user's explicit trial state selections (raw state)
  const [rawTrialStates, setRawTrialStates] = useState<Record<string, TrialClassState>>(() => {
    const initialStates: Record<string, TrialClassState> = {};
    trials.forEach(trial => {
      let selectedTemplate: ClassTemplate | null = null;
      let selectedClasses: ClassDefinition[] = [];

      if (trial.classes.length > 0) {
        const templateId = trial.classes[0]?.templateId;
        if (templateId) {
          selectedTemplate = templates.find(t => t.id === templateId) || null;
          if (selectedTemplate) {
            selectedClasses = trial.classes.map(cls => {
              const templateClass = selectedTemplate!.classDefinitions?.find(
                def => def.className === (cls.customizations?.className as string)
              );
              return (
                templateClass || {
                  className: (cls.customizations?.className as string) || 'Unknown Class',
                  element: (cls.customizations?.element as string) || 'Unknown Element',
                  displayOrder: 0,
                }
              );
            });
          }
        }
      }

      initialStates[trial.id] = { selectedTemplate, selectedClasses };
    });
    return initialStates;
  });

  // Extract show organization for stable dependency
  const showType = show?.organization;

  // Filter templates to active ones matching the show organization
  const activeTemplates = useMemo(() => {
    if (!showType) {
      return templates.filter(t => t.isActive);
    }

    const normalizedShowType = showType.toLowerCase().trim();

    const filtered = templates.filter(template => {
      if (!template.isActive) return false;
      const org = String(template.organization || '')
        .toLowerCase()
        .trim();
      return (
        org === normalizedShowType ||
        normalizedShowType.includes(org) ||
        org.includes(normalizedShowType)
      );
    });

    // Deduplicate by template name
    return filtered.filter(
      (template, index, arr) =>
        arr.findIndex(
          t => t.templateName?.toLowerCase() === template.templateName?.toLowerCase()
        ) === index
    );
  }, [templates, showType]);

  // Derive complete trial states (fills in missing trials and applies auto-select)
  const trialStates = useMemo(() => {
    const states: Record<string, TrialClassState> = { ...rawTrialStates };
    const autoSelectTemplate = activeTemplates.length === 1 ? activeTemplates[0] : null;

    trials.forEach(trial => {
      if (!states[trial.id]) {
        // Fill in missing trials with defaults
        states[trial.id] = { selectedTemplate: null, selectedClasses: [] };
      }
      // Auto-select single template for trials with no template set
      if (autoSelectTemplate && !states[trial.id].selectedTemplate) {
        states[trial.id] = {
          ...states[trial.id],
          selectedTemplate: autoSelectTemplate,
        };
      }
    });

    return states;
  }, [rawTrialStates, trials, activeTemplates]);

  // Get current trial and its state
  const currentTrial = trials.find(t => t.id === currentTrialId);
  const currentTrialState = trialStates[currentTrialId] || {
    selectedTemplate: null,
    selectedClasses: [],
  };

  // Filter DB existing classes to the current trial for the SimpleClassSelector prop
  const existingClassesForTrial = useMemo(() => {
    if (existingDBClasses.length === 0 || !currentTrialId) return [];
    return existingDBClasses
      .filter(c => c.trialId === currentTrialId)
      .map(c => ({
        className: c.className,
        element: c.element,
        level: c.level,
        section: c.section,
      }));
  }, [existingDBClasses, currentTrialId]);

  // Get total classes across all trials
  const totalClasses = trials.reduce((sum, trial) => sum + trial.classes.length, 0);

  // Prepare available judges from show's assigned judges
  const availableJudges = show.judgeIds.map(judgeId => ({
    judgeId,
    judgeName: judgeDetails[judgeId]?.name || 'Unknown Judge',
    assignedDate: new Date().toISOString().split('T')[0],
    email: judgeDetails[judgeId]?.email || '',
    phone: judgeDetails[judgeId]?.phone || '',
  }));

  useEffect(() => {
    if (show.judgeIds.length !== 1) return;
    const singleJudgeId = show.judgeIds[0];
    const unassignedClasses = trials.flatMap(trial =>
      trial.classes
        .map(cls => cls.customizations?.className as string)
        .filter(className => className && judgeAssignments[className] !== singleJudgeId)
    );
    if (unassignedClasses.length === 0) return;
    unassignedClasses.forEach(className => {
      assignJudgeToClass(className, singleJudgeId);
    });
  }, [show.judgeIds, trials, judgeAssignments, assignJudgeToClass]);

  // Derive validation errors (no setState needed)
  const errors = useMemo(() => {
    const newErrors: Record<string, string> = {};

    if (submitted && totalClasses === 0) {
      newErrors.classes = 'At least one class must be selected across all trials';
    }

    // Check that each trial has completed the class creation process
    if (submitted) {
      trials.forEach((trial, index) => {
        if (trial.classes.length === 0) {
          newErrors[`trial-${index}`] = `${trial.name} must have at least one class`;
        }
      });
    }

    return newErrors;
  }, [totalClasses, trials, submitted]);

  // Update trial state
  const updateTrialState = (trialId: string, updates: Partial<TrialClassState>) => {
    setRawTrialStates(prev => ({
      ...prev,
      [trialId]: { ...prev[trialId], ...updates },
    }));
  };

  // Handle template selection
  const handleTemplateSelected = (templateId: string) => {
    const template = activeTemplates.find(t => t.id === templateId);
    if (template) {
      updateTrialState(currentTrialId, {
        selectedTemplate: template,
        selectedClasses: [], // Reset classes when template changes
      });
    }
  };

  // Handle class selection
  const handleClassSelectionChange = (selectedClasses: ClassDefinition[]) => {
    // Persist both selected classes AND the current template (which may have been auto-selected
    // in derived state only) to prevent template loss on re-render
    updateTrialState(currentTrialId, {
      selectedClasses,
      selectedTemplate: currentTrialState.selectedTemplate,
    });

    // Update the trial with the selected classes
    if (currentTrial) {
      const classItems = selectedClasses.map(cls => ({
        templateId: currentTrialState.selectedTemplate?.id || '',
        customizations: {
          ...cls,
          fieldOverrides: {},
        },
        judgeId: judgeAssignments[cls.className], // Include judge assignment
      }));

      updateTrial(currentTrial.id, { classes: classItems });
    }
  };

  // Handle judge assignment changes
  const handleJudgeAssignmentChange = (assignments: Record<string, string>) => {
    // Update global judge assignments
    Object.entries(assignments).forEach(([classId, judgeId]) => {
      assignJudgeToClass(classId, judgeId);
    });

    // Also update the trial classes with judge assignments
    if (currentTrial && currentTrialState.selectedClasses.length > 0) {
      const classItems = currentTrialState.selectedClasses.map(cls => ({
        templateId: currentTrialState.selectedTemplate?.id || '',
        customizations: {
          ...cls,
          fieldOverrides: {},
        },
        judgeId: assignments[cls.className] || judgeAssignments[cls.className],
      }));

      updateTrial(currentTrial.id, { classes: classItems });
    }
  };

  return (
    <div className={className}>
      <div className="space-y-6">
        <div className="max-w-5xl mx-auto space-y-6 px-4">
          {/* Classes Header */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold pl-3 border-l-2 border-primary text-primary">
              Classes ({totalClasses})
            </h3>
          </div>

          {/* Template Selection Alert for No Templates */}
          {activeTemplates.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {show?.organization
                  ? `No active templates found for "${show.organization}" organization. Please create a template for this organization or ensure your templates are activated.`
                  : 'No active templates are available. Please create a template first or ensure your templates are activated.'}
              </AlertDescription>
            </Alert>
          )}

          {trials.length === 0 ? (
            <div className="relative rounded-2xl border-2 border-dashed border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent p-12 text-center overflow-hidden">
              <div className="relative">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-5 shadow-sm">
                  <ArrowLeft className="h-8 w-8 text-amber-500" />
                </div>
                <h4 className="text-xl font-semibold text-foreground mb-2">No Trials Configured</h4>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Please go back to the Trial Configuration step to add trials before configuring
                  classes.
                </p>
              </div>
            </div>
          ) : (
            <Tabs value={currentTrialId} onValueChange={setSelectedTrialId}>
              {/* Trial Tabs */}
              <TabsList className={`grid w-full grid-cols-${trials.length}`}>
                {trials.map(trial => {
                  const isCompleted = trial.classes.length > 0;
                  return (
                    <TabsTrigger key={trial.id} value={trial.id}>
                      <span className="truncate">{trial.name}</span>
                      <Badge
                        variant={isCompleted ? 'default' : 'outline'}
                        className="text-xs ml-1.5"
                      >
                        {isCompleted ? trial.classes.length : '0'}
                      </Badge>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {/* Trial Content */}
              {trials.map(trial => (
                <TabsContent key={trial.id} value={trial.id} className="space-y-6">
                  {/* Template Selection */}
                  {activeTemplates.length > 1 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          Select Template for {trial.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Available Templates
                            </label>
                            <Select
                              value={currentTrialState.selectedTemplate?.id || ''}
                              onValueChange={handleTemplateSelected}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a template">
                                  {currentTrialState.selectedTemplate?.id
                                    ? currentTrialState.selectedTemplate.templateName ||
                                      'Unnamed Template'
                                    : undefined}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {activeTemplates.map(template => {
                                  const orgValue =
                                    typeof template.organization === 'object'
                                      ? String(Object.values(template.organization)[0] || 'Unknown')
                                      : String(template.organization || 'Unknown');
                                  const showTypeValue =
                                    typeof template.trialType === 'object'
                                      ? String(Object.values(template.trialType)[0] || 'Unknown')
                                      : String(template.trialType || 'Unknown');
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

                          {currentTrialState.selectedTemplate && (
                            <div className="myk9-template-card">
                              <div className="myk9-template-header">
                                <div className="myk9-template-title-section">
                                  <FileText className="myk9-template-icon" />
                                  <h3 className="myk9-template-title">
                                    {currentTrialState.selectedTemplate.templateName ||
                                      'Unnamed Template'}
                                  </h3>
                                </div>
                              </div>

                              <div className="myk9-template-content">
                                <div className="myk9-template-details">
                                  <div className="myk9-template-detail-item">
                                    <span className="myk9-template-label">Classes Available:</span>
                                    <span className="myk9-template-value">
                                      {currentTrialState.selectedTemplate.classDefinitions
                                        ?.length || 0}{' '}
                                      classes
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Class Selection */}
                  {currentTrialState.selectedTemplate ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>Select Classes for {trial.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <SimpleClassSelector
                          template={currentTrialState.selectedTemplate}
                          selectedClasses={currentTrialState.selectedClasses}
                          onSelectionChange={handleClassSelectionChange}
                          existingClasses={existingClassesForTrial}
                          availableJudges={availableJudges}
                          judgeAssignments={judgeAssignments}
                          onJudgeAssignmentChange={handleJudgeAssignmentChange}
                        />
                      </CardContent>
                    </Card>
                  ) : activeTemplates.length > 0 ? (
                    <div className="relative rounded-2xl border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-10 text-center overflow-hidden">
                      <div className="relative">
                        <div className="mx-auto w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 shadow-sm">
                          <Layers className="h-7 w-7 text-primary" />
                        </div>
                        <h4 className="text-lg font-semibold text-foreground mb-2">
                          Select a Template
                        </h4>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                          Choose a template above to begin selecting classes for {trial.name}.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>
          )}

          {/* Validation Summary */}
          {Object.keys(errors).length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                  <p className="text-sm font-medium text-destructive mb-2">
                    Please fix the following errors to continue:
                  </p>
                  <ul className="text-sm text-destructive space-y-1">
                    {Object.values(errors).map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Card */}
          {totalClasses > 0 && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="font-medium">Configuration Summary</h4>
                    <p className="text-sm text-muted-foreground">
                      {totalClasses} total classes configured across{' '}
                      {trials.filter(t => t.classes.length > 0).length} trials
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{totalClasses * 15} min</div>
                    <div className="text-xs text-muted-foreground">Est. judging time</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassSelectionStep;
