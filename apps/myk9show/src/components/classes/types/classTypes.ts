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
  className?: string | undefined; // Generated class name
  classNumber?: string | undefined; // Class number for the trial
  element?: string | undefined; // Interior, Exterior, Container, etc.
  level?: string | undefined; // Novice, Advanced, Excellent, Masters, etc.
  section?: string | undefined; // A, B, C, etc.
  // Fee structure
  preEntryFee?: number | undefined;
  dayOfShowFee?: number | undefined;
  entryFee?: number | undefined; // Keep for backward compatibility
  maxEntries?: number | undefined;
  // Time management
  estimatedJudgingTime?: string | undefined;
  timeLimit1?: string | undefined;
  timeLimit2?: string | undefined;
  timeLimit3?: string | undefined;
  // Officials
  gateSteward?: string | undefined;
  tableSteward?: string | undefined;
  timerSteward?: string | undefined;
  ringSteward1?: string | undefined;
  ringSteward2?: string | undefined;
  ringSteward3?: string | undefined;
  // Requirements (Scent work specific)
  hidesUsed?: string | undefined;
  distractionsUsed?: string | undefined;
  itemsUsed?: string | undefined;
  requiresJumpHeight?: boolean | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
  photoUrl?: string | undefined;
  // Custom fields for different show types
  customFields?: Record<string, string> | undefined;
  // Template reference
  templateId?: string | undefined;
}

export interface CompetitionResult {
  id: string;
  armband: string;
  handler: string;
  dog: string;
  status: 'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn' | 'Eliminated';
  qualificationReason?: string | undefined; // Reason for NQ, Excused, or Withdrawn
  score: string;
  time: string;
  placement: string;
  classId: string;
  // Reference to original registration
  registrationEntryId?: string | undefined;
}

// Keep old name for backward compatibility during transition
export type EntryData = CompetitionResult;
