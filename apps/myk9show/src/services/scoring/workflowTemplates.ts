/**
 * Workflow Templates
 *
 * Default workflow templates for different scoring formats.
 * Defines the steps, actions, and settings for each format's judging workflow.
 */

import type { ScoringFormat } from '@/types/scoring-types';
import { DEFAULT_SCORING_CONFIGS } from '@/types/scoring-types';
import type { WorkflowTemplate, WorkflowStepDefinition, WorkflowStep, JudgeSession } from './judge-workflow-types';

/**
 * Create default workflow template for a scoring format
 */
export function createDefaultWorkflowTemplate(format: ScoringFormat): WorkflowTemplate {
  const steps: WorkflowStepDefinition[] = [
    {
      step: 'setup',
      name: 'Setup',
      description: 'Initialize judging session and validate permissions',
      required: true,
      allowSkip: false,
      estimatedDuration: 300000, // 5 minutes
      actions: ['validate_judge', 'setup_interface']
    },
    {
      step: 'entry_assignment',
      name: 'Entry Assignment',
      description: 'Assign entries to judge for scoring',
      required: true,
      allowSkip: false,
      prerequisites: ['setup'],
      estimatedDuration: 180000, // 3 minutes
      actions: ['assign_entries', 'validate_assignments']
    },
    {
      step: 'scoring',
      name: 'Scoring',
      description: 'Score assigned entries',
      required: true,
      allowSkip: false,
      prerequisites: ['entry_assignment'],
      actions: ['enable_scoring', 'track_progress']
    },
    {
      step: 'review',
      name: 'Review',
      description: 'Review scores and calculate placements',
      required: true,
      allowSkip: false,
      prerequisites: ['scoring'],
      estimatedDuration: 600000, // 10 minutes
      actions: ['calculate_placements', 'check_conflicts', 'generate_summary']
    },
    {
      step: 'finalization',
      name: 'Finalization',
      description: 'Finalize scores and submit results',
      required: true,
      allowSkip: false,
      prerequisites: ['review'],
      estimatedDuration: 300000, // 5 minutes
      actions: ['finalize_scores', 'generate_reports', 'submit_results']
    }
  ];

  return {
    id: `default_${format}`,
    name: `Default ${format.replace('_', ' ')} Workflow`,
    format,
    steps,
    defaultSettings: {
      allowRetry: true,
      requireConfirmation: true,
      enableRealTimeSync: true,
      autoAdvance: false
    },
    isCustom: false
  };
}

/**
 * Get all default workflow templates
 */
export function getAllDefaultWorkflowTemplates(): Map<string, WorkflowTemplate> {
  const templates = new Map<string, WorkflowTemplate>();
  const formats = Object.keys(DEFAULT_SCORING_CONFIGS) as ScoringFormat[];

  for (const format of formats) {
    const template = createDefaultWorkflowTemplate(format);
    templates.set(template.id, template);
  }

  return templates;
}

/**
 * Get workflow template for a format
 */
export function getWorkflowTemplate(
  format: ScoringFormat,
  customTemplates?: Map<string, WorkflowTemplate>
): WorkflowTemplate {
  const templateId = `default_${format}`;
  return customTemplates?.get(templateId) || createDefaultWorkflowTemplate(format);
}

/**
 * Check if a workflow step is completed based on session state
 */
export function isStepCompleted(
  session: JudgeSession,
  step: WorkflowStep,
  template?: WorkflowTemplate
): boolean {
  const workflowTemplate = template || createDefaultWorkflowTemplate(session.format);
  const stepIndex = workflowTemplate.steps.findIndex(s => s.step === step);
  const currentIndex = workflowTemplate.steps.findIndex(s => s.step === session.currentStep);

  return stepIndex < currentIndex;
}

/**
 * Get next workflow step in sequence
 */
export function getNextStep(
  currentStep: WorkflowStep,
  template: WorkflowTemplate
): WorkflowStep | null {
  const currentIndex = template.steps.findIndex(s => s.step === currentStep);
  if (currentIndex >= template.steps.length - 1) {
    return null;
  }
  return template.steps[currentIndex + 1].step;
}

/**
 * Check if prerequisites are met for a step
 */
export function arePrerequisitesMet(
  targetStep: WorkflowStep,
  session: JudgeSession,
  template: WorkflowTemplate
): boolean {
  const targetStepDef = template.steps.find(s => s.step === targetStep);
  if (!targetStepDef) {
    return false;
  }

  return targetStepDef.prerequisites?.every(prereq =>
    isStepCompleted(session, prereq, template)
  ) ?? true;
}

/**
 * Get step definition by step type
 */
export function getStepDefinition(
  step: WorkflowStep,
  template: WorkflowTemplate
): WorkflowStepDefinition | undefined {
  return template.steps.find(s => s.step === step);
}
