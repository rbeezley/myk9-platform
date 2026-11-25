import type { ClassData } from '@/components/classes/types/classTypes';
import type { TrialClass } from '@/components/trials/types/trial.types';
import type { ReactNode } from 'react';
import type { ClassStatusValue } from '@myk9/core';

import type { JudgeChangeWarningProps } from '@/components/classes/JudgeChangeWarning';
import type { EditPanelDeleteOption } from './EditPanelDelete';

export type CapacityControl = 'maxEntries' | 'allowsWaitlist';

export interface ClassEditPanelProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  initialClassData: Partial<ClassData | TrialClass>;
  onSave?: (classData: Partial<ClassData | TrialClass>) => Promise<void>;
  enableAutoSave?: boolean;
  showId?: string;
  mode?: 'full' | 'simple'; // 'full' for ClassData with tabs, 'simple' for TrialClass
  /** "Delete class" in the footer. Omit for a viewer who cannot delete. */
  onDelete?: EditPanelDeleteOption | undefined;
  /**
   * Show Desk's class settings (MYK9-2379): live-saving controls that replace the panel's own
   * Status and Judge fields and are never part of Save Changes.
   */
  liveSettings?: ReactNode;
  /** The settings hold the live Judge control, so the panel's own Judge field is hidden. */
  liveJudge?: boolean;
}

/** The judge the edit panel opened with, for the judge-change warning (MYK9-2015). */
export type OutgoingJudge = Omit<JudgeChangeWarningProps, 'selectedJudgeId'>;

// Form data interface for ClassData
export interface ClassEditFormData extends Record<string, unknown> {
  // Basic info
  element: string;
  level: string;
  section: string;
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

  // Entry limit and wait list (`classes.max_entries` / `classes.allow_waitlist`)
  /** null = no class limit. */
  maxEntries?: number | null;
  /** null follows the show's "Allow wait lists" (MYK9-1019). */
  allowsWaitlist?: boolean | null;
  /** Capacity controls the user edited in THIS session; only these reach the save. */
  editedCapacity?: CapacityControl[];

  // MYK9-1931: the class's own fee (`classes.entry_fee`); 0 or absent charges the show's fee.
  entryFee?: number;
  /** False when the class came from a source that did not carry its fee: no field is shown. */
  entryFeeLoaded?: boolean;
  /** Set once the fee is changed in this session; only then is it saved. */
  entryFeeEdited?: boolean;
}

// Form data interface for simple TrialClass
export interface TrialClassEditFormData extends Record<string, unknown> {
  element: string;
  level: string;
  section: string;
  judgeId: string;
  judgeName?: string;
  status: ClassStatusValue;
  entries: number;
  /** null = no class limit. */
  maxEntries?: number | null;
  /** null follows the show's "Allow wait lists" (MYK9-1019). */
  allowsWaitlist?: boolean | null;
  /** Capacity controls the user edited in THIS session; only these reach the save. */
  editedCapacity?: CapacityControl[];
  /** MYK9-1931: the class's own fee; see ClassEditFormData. */
  entryFee?: number;
  entryFeeLoaded?: boolean;
  entryFeeEdited?: boolean;
  /** Time limits (m:ss). Shown only when the class came from a source that carried them. */
  timeLimit1?: string;
  timeLimit2?: string;
  timeLimit3?: string;
  timeLimitLoaded?: boolean;
  /** Set once a limit is changed in this session; only then are they saved. */
  timeLimitEdited?: boolean;
}
