// Re-export JudgeQualification for components that import from judge-types
export type { JudgeQualification } from './user-types';

export interface ShowJudgeAssignment {
  judgeId: string; // User ID
  judgeName: string; // For quick display
  assignedDate: string;
  availableStartTime?: string;
  availableEndTime?: string;
  assignedClasses?: string[]; // Classes this judge is assigned to
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
  assignments: judge.assignedClasses || []
});

export const convertLegacyToShowJudge = (legacy: LegacyJudgeAssignment): ShowJudgeAssignment => ({
  judgeId: legacy.id,
  judgeName: legacy.name,
  assignedDate: new Date().toISOString().split('T')[0],
  assignedClasses: legacy.assignments
});

export const convertShowJudgeArrayToLegacy = (judges: ShowJudgeAssignment[]): LegacyJudgeAssignment[] => 
  judges.map(convertShowJudgeToLegacy);

export const convertLegacyArrayToShowJudge = (legacy: LegacyJudgeAssignment[]): ShowJudgeAssignment[] => 
  legacy.map(convertLegacyToShowJudge);