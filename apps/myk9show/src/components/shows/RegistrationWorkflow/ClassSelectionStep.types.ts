import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import type { WorkflowMode } from './RegistrationWorkflow.types';

export interface ClassSelectionStepProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  onSelectionChange: (selections: ClassSelectionData[]) => void;
  showId: string;
  /** When provided, renders an inline handler section (used when handler-assignment step is removed) */
  handlerAssignments?: Record<string, HandlerInfo>;
  onHandlerAssignmentChange?: (assignments: Record<string, HandlerInfo>) => void;
  /**
   * Which flow is rendering this shared step. Drives the already-entered
   * recovery path: exhibitors are pointed at the show team, staff at Entry
   * Management (telling a secretary to message the show team would open a
   * thread with themselves). Defaults to the exhibitor wizard.
   */
  workflowMode?: WorkflowMode | undefined;
}

export interface LevelInfo {
  classId: string;
  level: string;
  section: string | undefined;
  displayLabel: string;
  isSelected: boolean;
  isAlreadyEntered: boolean;
  requiresJumpHeight?: boolean | undefined;
  /** True when the judge-day capacity for this class is exhausted */
  isJudgeDayFull?: boolean | undefined;
  /** Number of entries currently on the waitlist for this class */
  waitlistCount?: number | undefined;
}

export interface ElementGroup {
  element: string;
  fee: number;
  levels: LevelInfo[];
  /** True when the element has no levels (e.g., "Detective") — render checkbox inline in header */
  isSingleClass: boolean;
}
