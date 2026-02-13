export interface EditMode {
  showId: string;
  mode: 'add-trials' | 'add-classes' | 'edit-show';
}

export interface ShowCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editMode?: EditMode | undefined;
}

export interface WizardStepDefinition {
  id: number;
  label: string;
  description: string;
}

export const WIZARD_STEPS: WizardStepDefinition[] = [
  { id: 0, label: 'Show Details', description: 'Basic information' },
  { id: 1, label: 'Trials', description: 'Configure trials' },
  { id: 2, label: 'Classes', description: 'Select from templates' },
  { id: 3, label: 'Review', description: 'Final confirmation' },
];
