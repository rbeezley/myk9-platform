/**
 * Types for WaitlistManagementPage
 */

import type { WaitlistEntry, ClassWithWaitlistCount } from '@/services/database/waitlists';

export interface ActionDialogState {
  open: boolean;
  action: 'offer' | 'remove' | null;
  entry: WaitlistEntry | null;
}

/** One class's waiting dogs, in join order (the queue position the database assigned). */
export interface WaitlistClassGroup {
  cls: ClassWithWaitlistCount;
  entries: WaitlistEntry[];
}

// Re-export for convenience
export type { WaitlistEntry, ClassWithWaitlistCount };
