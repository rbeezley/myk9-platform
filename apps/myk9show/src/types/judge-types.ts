// Re-export JudgeQualification for components that import from judge-types
export type { JudgeQualification } from './user-types';

export interface ShowJudgeAssignment {
  judgeId: string; // User ID
  judgeName: string; // For quick display
  assignedDate: string;
  availableStartTime?: string;
  availableEndTime?: string;
  assignedClasses?: string[]; // Classes this judge is assigned to
  /** True when the judge has a show-level row (not only class-level rows). Show-level removal only touches these. */
  hasShowLevelAssignment?: boolean;
  /** "City, ST" of residence for the premium (MYK9-2067); null or absent when `people` has no city. */
  residence?: string | null;
  /** "ASCA-approved judge, Region 4" (MYK9-2292, ASCA §1.5.7) from `people.judge_affiliation`; null or absent when unset. */
  affiliation?: string | null;
  /** Labels ("Element Level Section") of the classes assigned at class level. */
  classLabels?: string[];
  /**
   * The same labels keyed by the trial the class belongs to, matched to a premium trial by name
   * and date (premium trials carry no id). Empty or absent when no class-level row has a trial.
   */
  classLabelsByTrial?: Array<{ trialName: string; trialDate: string; labels: string[] }>;
}

// Legacy format used in some parts of the codebase
export interface LegacyJudgeAssignment {
  id: string;
  name: string;
  assignments: string[];
}

// Conversion utilities
export const convertShowJudgeToLegacy = (judge: ShowJudgeAssignment): LegacyJudgeAssignment => ({
  id: judge.judgeId,
  name: judge.judgeName,
  assignments: judge.assignedClasses || [],
});

export const convertLegacyToShowJudge = (legacy: LegacyJudgeAssignment): ShowJudgeAssignment => ({
  judgeId: legacy.id,
  judgeName: legacy.name,
  assignedDate: new Date().toISOString().split('T')[0],
  assignedClasses: legacy.assignments,
});

export const convertShowJudgeArrayToLegacy = (
  judges: ShowJudgeAssignment[]
): LegacyJudgeAssignment[] => judges.map(convertShowJudgeToLegacy);

export const convertLegacyArrayToShowJudge = (
  legacy: LegacyJudgeAssignment[]
): ShowJudgeAssignment[] => legacy.map(convertLegacyToShowJudge);
