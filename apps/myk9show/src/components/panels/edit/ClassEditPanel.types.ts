import type { ClassData } from '@/components/classes/types/classTypes';
import type { TrialClass } from '@/components/trials/types/trial.types';
import type { ClassStatusValue } from '@myk9/core';

export interface ClassEditPanelProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  initialClassData: Partial<ClassData | TrialClass>;
  onSave?: (classData: Partial<ClassData | TrialClass>) => Promise<void>;
  enableAutoSave?: boolean;
  showId?: string;
}

// Form data interface for ClassData
export interface ClassEditFormData extends Record<string, unknown> {
  // Basic info
  element: string;
  level: string;
  section: string;
  classOrder: string;
  status: ClassStatusValue;

  // Timing details
  estimatedJudgingTime?: string;
  timeLimit1?: string;
  timeLimit2?: string;
  timeLimit3?: string;

  // Officials
  judge?: string;
  judgeId?: string;
  gateSteward?: string;
  tableSteward?: string;
  timerSteward?: string;
  ringSteward1?: string;
  ringSteward2?: string;
  ringSteward3?: string;

  // Requirements
  hidesUsed?: string;
  distractionsUsed?: string;
  itemsUsed?: string;

  // Fee structure
  preEntryFee?: number;
  dayOfShowFee?: number;
}
