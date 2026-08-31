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

export interface RegistrationClassSource {
  id: string;
  element?: string | undefined;
  level?: string | undefined;
  section?: string | undefined;
  className?: string | undefined;
}

export interface LevelInfo {
  classId: string;
  /** Source class name retained for conservative eligibility checks. */
  className?: string | undefined;
  level: string;
  section: string | undefined;
  displayLabel: string;
  isSelected: boolean;
  isAlreadyEntered: boolean;
  requiresJumpHeight?: boolean | undefined;
  /** True when the judge-day capacity for this class is exhausted */
  isJudgeDayFull?: boolean | undefined;
  /** True when either judge-day or per-class capacity is exhausted */
  isFull?: boolean | undefined;
  /** Number of entries currently on the waitlist for this class */
  waitlistCount?: number | undefined;
  /** True when the class accepts new wait-list requests */
  allowsWaitlist?: boolean | undefined;
  /** True when the availability read did not return a trustworthy row for this class. */
  isAvailabilityUnknown?: boolean | undefined;
  /** Entry is unavailable until the dog has a registration for this trial's registry. */
  isRegistrationBlocked?: boolean | undefined;
  /** Calm explanation for a registration block or puppy-class exception. */
  registrationGuidance?: string | null | undefined;
}

export interface ElementGroup {
  element: string;
  fee: number;
  levels: LevelInfo[];
  /** True when the element has no levels (e.g., "Detective") — render checkbox inline in header */
  isSingleClass: boolean;
}
