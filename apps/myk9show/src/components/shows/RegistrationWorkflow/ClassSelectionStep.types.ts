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
