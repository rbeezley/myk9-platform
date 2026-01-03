import { ReactNode } from 'react';

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
 * Default workflow configurations by role
 */
export const WORKFLOW_CONFIGS: Record<string, WorkflowConfig> = {
  exhibitor: {
    steps: ['dog-selection', 'class-selection', 'payment', 'confirmation'],
    features: {
      bulkSelection: false,
      createNew: false,
      advancedSearch: false,
      handlerAssignment: false,
      statusManagement: false,
      paymentOverride: false
    },
    ui: {
      showAdvancedOptions: false,
      showBulkActions: false,
      showQuickFilters: true,
      maxDogsPerRegistration: 5
    }
  },
  secretary_existing: {
    steps: ['dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: false,
      advancedSearch: true,
      handlerAssignment: true,
      statusManagement: true,
      paymentOverride: false
    },
    ui: {
      showAdvancedOptions: true,
      showBulkActions: true,
      showQuickFilters: true,
      maxDogsPerRegistration: 50
    }
  },
  secretary_new: {
    steps: ['create-exhibitor', 'dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      statusManagement: true,
      paymentOverride: true
    },
    ui: {
      showAdvancedOptions: true,
      showBulkActions: true,
      showQuickFilters: true,
      maxDogsPerRegistration: 50
    }
  },
  club_admin: {
    steps: ['create-exhibitor', 'dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      statusManagement: true,
      paymentOverride: true
    },
    ui: {
      showAdvancedOptions: true,
      showBulkActions: true,
      showQuickFilters: true,
      maxDogsPerRegistration: 100
    }
  },
  site_admin: {
    steps: ['create-exhibitor', 'dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
    features: {
      bulkSelection: true,
      createNew: true,
      advancedSearch: true,
      handlerAssignment: true,
      statusManagement: true,
      paymentOverride: true
    },
    ui: {
      showAdvancedOptions: true,
      showBulkActions: true,
      showQuickFilters: true,
      maxDogsPerRegistration: 1000
    }
  }
};

/**
 * Higher-order component props
 */
export interface WithRegistrationContextProps {
  children: ReactNode;
}