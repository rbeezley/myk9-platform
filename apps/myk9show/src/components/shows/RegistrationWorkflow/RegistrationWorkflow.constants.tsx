import { Dog, Trophy, CreditCard, CheckSquare, UserCheck } from 'lucide-react';
import type {
  WorkflowConfig,
  WorkflowMode,
  StepId,
  RegistrationStep,
} from './RegistrationWorkflow.types';

export const WORKFLOW_CONFIGS: Record<WorkflowMode, WorkflowConfig> = {
  exhibitor: {
    // INTENT: Exhibitors only see their own dogs (max 5) — auto-select all and show
    // one tab per dog in class selection. Dogs with no classes selected produce no entries.
    // Handler auto-assigned to dog owner; inline collapsible in class selection to change.
    steps: ['class-selection', 'payment', 'confirmation'],
    features: {
      bulkSelection: false,
      createNew: false,
      advancedSearch: false,
      handlerAssignment: true,
      paymentOverride: false,
      statusManagement: false,
    },
    smartDefaults: {
      autoAssignHandler: true,
      autoCalculateFees: true,
      delayRegistrationCreation: false,
    },
  },
  secretary_existing: {
    steps: ['dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: false,
      advancedSearch: true,
      handlerAssignment: true,
      paymentOverride: true,
      statusManagement: true,
    },
    smartDefaults: {
      autoAssignHandler: true,
      autoCalculateFees: true,
      delayRegistrationCreation: true,
    },
  },
  secretary_new: {
    steps: ['dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      paymentOverride: true,
      statusManagement: true,
    },
    smartDefaults: {
      autoAssignHandler: true,
      autoCalculateFees: true,
      delayRegistrationCreation: true,
    },
  },
  club_admin: {
    steps: ['dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      paymentOverride: true,
      statusManagement: true,
    },
    smartDefaults: {
      autoAssignHandler: true,
      autoCalculateFees: false,
      delayRegistrationCreation: true,
    },
  },
  site_admin: {
    steps: ['dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      paymentOverride: true,
      statusManagement: true,
    },
    smartDefaults: {
      autoAssignHandler: true,
      autoCalculateFees: false,
      delayRegistrationCreation: true,
    },
  },
};

export const ALL_STEP_DEFINITIONS: Record<StepId, Omit<RegistrationStep, 'completed'>> = {
  'dog-selection': {
    id: 0,
    label: 'Select Dogs',
    description: 'Choose which dogs to register',
    icon: <Dog className="h-5 w-5" />,
  },
  'class-selection': {
    id: 1,
    label: 'Classes',
    description: 'Select classes for each dog',
    icon: <Trophy className="h-5 w-5" />,
  },
  'handler-assignment': {
    id: 2,
    label: 'Handlers',
    description: 'Assign handlers for entries',
    icon: <UserCheck className="h-5 w-5" />,
    // Secretary/admin roles get a dedicated step. Exhibitors use an inline
    // collapsible in ClassSelectionStep instead (see InlineHandlerSection).
  },
  payment: {
    id: 3,
    label: 'Payment',
    description: 'Review fees and payment',
    icon: <CreditCard className="h-5 w-5" />,
  },
  confirmation: {
    id: 4,
    label: 'Confirmation',
    description: 'Review and confirm',
    icon: <CheckSquare className="h-5 w-5" />,
  },
};

export const STEP_ANIMATION_VARIANTS = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};
