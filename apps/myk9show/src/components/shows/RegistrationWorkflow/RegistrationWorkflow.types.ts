import type { RegistrationFormData } from '@/types/show-registration-types';

export interface RegistrationStep {
  id: number;
  label: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  optional?: boolean;
  requiredForRole?: string[];
}

export type WorkflowMode =
  | 'exhibitor'
  | 'secretary_existing'
  | 'secretary_new'
  | 'club_admin'
  | 'site_admin';

export type StepId =
  | 'dog-selection'
  | 'class-selection'
  | 'handler-assignment'
  | 'payment'
  | 'confirmation';

export interface WorkflowConfig {
  steps: StepId[];
  features: {
    bulkSelection: boolean;
    createNew: boolean;
    advancedSearch: boolean;
    handlerAssignment: boolean;
    paymentOverride: boolean;
    statusManagement: boolean;
  };
  smartDefaults: {
    autoAssignHandler: boolean;
    autoCalculateFees: boolean;
    delayRegistrationCreation: boolean;
  };
}

export interface RegistrationWorkflowProps {
  showId: string;
  onComplete: (data: RegistrationFormData) => void;
  onCancel: () => void;
}
