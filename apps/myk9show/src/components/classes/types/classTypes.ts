export interface ClassData {
  id: string;
  trialId: string;
  trial: string;
  trialDate: string;
  trialNumber: string;
  classOrder: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled' | 'Upcoming';
  judge: string;
  // More flexible class properties to support different organizations
  className?: string; // Generated class name
  classNumber?: string; // Class number for the trial
  element?: string; // Interior, Exterior, Container, etc.
  level?: string; // Novice, Advanced, Excellent, Masters, etc.
  section?: string; // A, B, C, etc.
  // Fee structure
  preEntryFee?: number;
  dayOfShowFee?: number;
  entryFee?: number; // Keep for backward compatibility
  maxEntries?: number;
  // Time management
  estimatedJudgingTime?: string;
  timeLimit1?: string;
  timeLimit2?: string;
  timeLimit3?: string;
  // Officials
  gateSteward?: string;
  tableSteward?: string;
  timerSteward?: string;
  ringSteward1?: string;
  ringSteward2?: string;
  ringSteward3?: string;
  // Requirements (Scent work specific)
  hidesUsed?: string;
  distractionsUsed?: string;
  itemsUsed?: string;
  requiresJumpHeight?: boolean;
  startTime?: string;
  endTime?: string;
  photoUrl?: string;
  // Custom fields for different show types
  customFields?: Record<string, string>;
  // Template reference
  templateId?: string;
}

export interface CompetitionResult {
  id: string;
  armband: string;
  handler: string;
  dog: string;
  status: 'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn' | 'Eliminated';
  qualificationReason?: string; // Reason for NQ, Excused, or Withdrawn
  score: string;
  time: string;
  placement: string;
  classId: string;
  // Reference to original registration
  registrationEntryId?: string;
}

// Keep old name for backward compatibility during transition
export type EntryData = CompetitionResult;
