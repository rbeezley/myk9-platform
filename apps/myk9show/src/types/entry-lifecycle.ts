// Single store architecture for dog show entries
// Entry progresses through lifecycle stages

export type EntryStatus = 
  | 'draft'           // User building entry
  | 'submitted'       // Entry submitted, awaiting payment
  | 'paid'           // Payment confirmed
  | 'confirmed'      // Entry accepted by show
  | 'scheduled'      // Running order created
  | 'competing'      // Currently in ring
  | 'completed'      // Results recorded
  | 'withdrawn'      // Entry withdrawn
  | 'scratched';     // Scratched day of show

export interface ShowEntry {
  // Identity
  id: string;
  showId: string;
  classId: string;
  dogId: string;
  
  // Current state
  status: EntryStatus;
  
  // Registration phase data
  registrationData: {
    submittedAt: Date;
    handler: string;
    handlerId?: string;
    entryFee: number;
    paymentStatus: 'pending' | 'paid' | 'refunded';
    specialRequests?: string;
    armband?: string;
    runOrder?: number;
  };
  
  // Competition phase data (only populated when status >= 'competing')
  competitionData?: {
    startTime?: Date;
    endTime?: Date;
    score?: string;
    time?: string;
    placement?: string;
    qualified?: boolean;
    judgeNotes?: string;
    recordedBy: string; // Judge/steward who recorded result
  };
  
  // Audit trail
  statusHistory: Array<{
    status: EntryStatus;
    timestamp: Date;
    userId: string;
    reason?: string;
  }>;
}

// Store interface
export interface EntryStore {
  entries: ShowEntry[];
  
  // Registration phase methods
  createEntry: (data: Omit<ShowEntry, 'id' | 'status' | 'statusHistory'>) => void;
  updateRegistration: (entryId: string, updates: Partial<ShowEntry['registrationData']>) => void;
  updateStatus: (entryId: string, status: EntryStatus, userId: string, reason?: string) => void;
  
  // Competition phase methods
  recordResult: (entryId: string, result: ShowEntry['competitionData'], recordedBy: string) => void;
  updateResult: (entryId: string, updates: Partial<ShowEntry['competitionData']>, recordedBy: string) => void;
  
  // Queries
  getEntriesByClass: (classId: string) => ShowEntry[];
  getEntriesByShow: (showId: string) => ShowEntry[];
  getEntriesByStatus: (status: EntryStatus) => ShowEntry[];
  getCompetitionResults: (classId: string) => ShowEntry[]; // Only entries with results
}