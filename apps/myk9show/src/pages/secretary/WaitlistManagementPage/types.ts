/**
 * Types for WaitlistManagementPage
 */

import type {
  WaitlistEntry,
  WaitlistOffer,
  ClassWithWaitlistCount,
} from '@/services/database/waitlists';

export interface ActionDialogState {
  open: boolean;
  /** 'withdraw' takes back an open offer (MYK9-1001). */
  action: 'offer' | 'remove' | 'withdraw' | null;
  entry: WaitlistEntry | null;
}

/** One class's waiting dogs, in join order (the queue position the database assigned). */
export interface WaitlistClassGroup {
  cls: ClassWithWaitlistCount;
  entries: WaitlistEntry[];
}

// Re-export for convenience
export type { WaitlistEntry, WaitlistOffer, ClassWithWaitlistCount };
