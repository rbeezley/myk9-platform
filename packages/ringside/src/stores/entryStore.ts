import type { EntryStatus } from '@myk9/core';
import type { NotRunningReason } from '../pages/EntryList/runQueue';

// Entry status type — canonical definition in @myk9/core
export type { EntryStatus } from '@myk9/core';

export interface Entry {
  /** UUID in the unified platform DB (Phase 1 id-model migration). */
  id: string;
  /** `null` when the entry has no armband assigned. Never coerced to 0. */
  armband: number | null;
  callName: string;
  breed: string;
  handler: string;
  jumpHeight?: string;
  preferredTime?: string;
  isScored: boolean;
  // New unified status field
  status: EntryStatus;
  // Deprecated fields (for backward compatibility during migration)
  /** @deprecated Use status instead */
  inRing?: boolean;
  /** @deprecated Use status instead */
  checkedIn?: boolean;
  /** @deprecated Use status instead */
  checkinStatus?: EntryStatus;

  resultText?: string;
  searchTime?: string;
  faultCount?: number;
  placement?: number;
  classId: string;
  className: string;
  section?: string;
  element?: string;
  level?: string;
  timeLimit?: string;
  timeLimit2?: string;
  timeLimit3?: string;
  areas?: number;
  exhibitorOrder?: number;
  actualClassId?: string; // The real class ID for real-time subscriptions
  competitionType?: string; // Competition type for nationals detection
  trialDate?: string; // Trial date from view
  trialNumber?: string | number; // Trial number from view
  // Nationals-specific scoring fields
  correctFinds?: number;
  incorrectFinds?: number;
  noFinishCount?: number;
  totalPoints?: number;
  // Reason fields
  nqReason?: string;
  excusedReason?: string;
  withdrawnReason?: string;
  // Visibility flags - control what results are visible based on user role and timing settings
  showPlacement?: boolean;
  showQualification?: boolean;
  showTime?: boolean;
  showFaults?: boolean;
  /**
   * MYK9-1162: the server says this entry's dog has no registration number for
   * the trial's registry. The dog keeps its run-order place but cannot be scored
   * until the secretary adds the number. Absent means not held.
   */
  awaitingRegistrationNumber?: boolean;
  /**
   * The entry lifecycle (scratched, withdrawn, absent) says this dog will not run, whatever the
   * check-in column holds (MYK9-1809). Only the secretary can bring the entry back, so no
   * check-in status change helps. Absent means the host did not say, which reads as running.
   */
  notRunningByEntryStatus?: boolean;
  /**
   * Why the dog is not running, so its row reads its own word: Pulled, Withdrawn, Absent or
   * Moved (MYK9-1940). Absent means the dog is running.
   */
  notRunningReason?: NotRunningReason;
  /** Scoring/ring timestamps used by the class-completion elapsed-time summary. */
  scoredAt?: string;
  ringEntryTime?: string;
  ringExitTime?: string;
}
