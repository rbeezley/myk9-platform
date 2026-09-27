import { mutationManager } from '@/services/replication/sharedMutationManager';

/**
 * Does this device hold a write the server has not received? An unreadable
 * queue cannot prove otherwise, so it answers true (MYK9-774).
 */
export async function hasPendingLocalWritesOrUnknown(): Promise<boolean> {
  try {
    return (await mutationManager.getPendingCount()) > 0;
  } catch {
    return true;
  }
}
