import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';

export interface ClassSelectionStepProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  onSelectionChange: (selections: ClassSelectionData[]) => void;
  showId: string;
  /** When provided, renders an inline handler section (used when handler-assignment step is removed) */
  handlerAssignments?: Record<string, HandlerInfo>;
  onHandlerAssignmentChange?: (assignments: Record<string, HandlerInfo>) => void;
}

export interface ClassWithTrial {
  classData: {
    id: string;
    name: string;
    description?: string | undefined;
    fee?: number | undefined;
    entryFee?: number | undefined;
    className?: string | undefined;
    requiresJumpHeight?: boolean | undefined;
  } & Record<string, unknown>;
  trial: {
    id: string;
    name: string;
    date: string;
  };
}
