import type { Dog, User } from '@/types/dog-types';
import type { QuickCreateStep } from './QuickCreateFlow.helpers';

export interface QuickCreateFlowState {
  step: QuickCreateStep;
  exhibitor: User | null;
  exhibitorPendingMutationIds: string[];
  dogs: Dog[];
  isComplete: boolean;
}

export const INITIAL_QUICK_CREATE_FLOW_STATE: QuickCreateFlowState = {
  step: 'exhibitor',
  exhibitor: null,
  exhibitorPendingMutationIds: [],
  dogs: [],
  isComplete: false,
};
