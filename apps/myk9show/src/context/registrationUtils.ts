import { ReactNode } from 'react';
import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';

/**
 * Workflow configuration based on user role
 */
export interface WorkflowConfig {
  steps: string[];
  features: {
    bulkSelection: boolean;
    createNew: boolean;
    advancedSearch: boolean;
    handlerAssignment: boolean;
    statusManagement: boolean;
    paymentOverride: boolean;
  };
  ui: {
    showAdvancedOptions: boolean;
    showBulkActions: boolean;
    showQuickFilters: boolean;
    maxDogsPerRegistration: number;
  };
}

/**
 * Default workflow configurations by role.
 *
 * Keyed on the wizard's own `WorkflowMode` so this config cannot carry a
 * workflow the wizard does not define. A superseded secretary workflow
 * outlived the wizard's deletion of it here, behind a branch nothing routed to
 * (MYK9-512). A mode added or removed in `RegistrationWorkflow.types.ts` now
 * fails to compile until this record follows.
 */
export const WORKFLOW_CONFIGS: Record<WorkflowMode, WorkflowConfig> = {
  exhibitor: {
    steps: ['dog-selection', 'class-selection', 'payment', 'confirmation'],
    features: {
      bulkSelection: false,
      createNew: false,
      advancedSearch: false,
      handlerAssignment: false,
      statusManagement: false,
      paymentOverride: false,
    },
    ui: {
      showAdvancedOptions: false,
      showBulkActions: false,
      showQuickFilters: true,
      maxDogsPerRegistration: 5,
    },
  },
  secretary_new: {
    steps: [
      'create-exhibitor',
      'dog-selection',
      'class-selection',
      'handler-assignment',
      'payment',
      'confirmation',
    ],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      statusManagement: true,
      paymentOverride: true,
    },
    ui: {
      showAdvancedOptions: true,
      showBulkActions: true,
      showQuickFilters: true,
      maxDogsPerRegistration: 50,
    },
  },
  club_admin: {
    steps: [
      'create-exhibitor',
      'dog-selection',
      'class-selection',
      'handler-assignment',
      'payment',
      'confirmation',
    ],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      statusManagement: true,
      paymentOverride: true,
    },
    ui: {
      showAdvancedOptions: true,
      showBulkActions: true,
      showQuickFilters: true,
      maxDogsPerRegistration: 100,
    },
  },
  site_admin: {
    steps: [
      'create-exhibitor',
      'dog-selection',
      'class-selection',
      'handler-assignment',
      'payment',
      'confirmation',
    ],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      statusManagement: true,
      paymentOverride: true,
    },
    ui: {
      showAdvancedOptions: true,
      showBulkActions: true,
      showQuickFilters: true,
      maxDogsPerRegistration: 1000,
    },
  },
};

/**
 * Higher-order component props
 */
export interface WithRegistrationContextProps {
  children: ReactNode;
}
