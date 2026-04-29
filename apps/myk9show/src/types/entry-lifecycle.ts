// Single store architecture for dog show entries
// Entry progresses through lifecycle stages

export type EntryStatus =
  // Pre-show lifecycle
  | 'no-status' // DB default, not yet categorized
  | 'draft' // User building entry
  | 'submitted' // Submitted, awaiting payment
  | 'paid' // Payment confirmed
  | 'confirmed' // Accepted by show
  | 'scheduled' // Running order assigned (UI-only, not a DB constraint value)
  // Day-of states
  | 'checked-in' // Dog checked in at venue
  | 'at-gate' // At the gate, next to run
  | 'in-ring' // Currently competing
  | 'competing' // In-ring / actively competing
  | 'completed' // Results recorded
  // Terminal / removal states
  | 'withdrawn' // Exhibitor or secretary withdrew the entry
  | 'not_accepted' // Secretary declined the entry
  | 'scratched' // Scratched day of show
  | 'absent' // Dog did not appear
  | 'moved' // Entry moved to a different class (source record)
  // Secretary-approval workflow
  | 'scratch-requested' // Exhibitor requested scratch; awaiting secretary approval
  | 'move-up-requested' // Exhibitor requested move-up; awaiting secretary approval
  // Waitlist promotion flow
  | 'pending-payment' // Promoted from waitlist, awaiting Stripe checkout
  | 'promotion-expired'; // Did not pay within promotion deadline

/**
 * Statuses where the dog is currently in the ring.
 * 'competing' is the myK9Show legacy name; 'in-ring' is what myK9Q writes.
 * Kept as synonyms until a future migration collapses them.
 */
export const IN_RING_STATUSES = ['competing', 'in-ring'] as const satisfies readonly EntryStatus[];

export function isInRingStatus(status: EntryStatus | string | null | undefined): boolean {
  return status === 'competing' || status === 'in-ring';
}

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
    handlerId?: string | undefined;
    entryFee: number;
    paymentStatus: 'pending' | 'paid' | 'refunded';
    specialRequests?: string | undefined;
    armband?: string | undefined;
    runOrder?: number | undefined;
  };

  // Competition phase data (only populated when status >= 'competing')
  competitionData?:
    | {
        startTime?: Date | undefined;
        endTime?: Date | undefined;
        score?: string | undefined;
        time?: string | undefined;
        placement?: string | undefined;
        qualified?: boolean | undefined;
        judgeNotes?: string | undefined;
        recordedBy: string; // Judge/steward who recorded result
      }
    | undefined;

  // Audit trail
  statusHistory: Array<{
    status: EntryStatus;
    timestamp: Date;
    userId: string;
    reason?: string | undefined;
  }>;

  // Used to enable extensions
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
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
  updateResult: (
    entryId: string,
    updates: Partial<ShowEntry['competitionData']>,
    recordedBy: string
  ) => void;

  // Queries
  getEntriesByClass: (classId: string) => ShowEntry[];
  getEntriesByShow: (showId: string) => ShowEntry[];
  getEntriesByStatus: (status: EntryStatus) => ShowEntry[];
  getCompetitionResults: (classId: string) => ShowEntry[]; // Only entries with results
}
