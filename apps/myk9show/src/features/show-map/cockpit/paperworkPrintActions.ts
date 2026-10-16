import type { User } from '@supabase/supabase-js';
import { toast } from 'sonner';

import { showUndoToast } from '@/lib/undoToast';
import {
  replicatedPaperworkPrintsTable,
  type ReplicatedPaperworkPrint,
} from '@/services/replication';

import type { PaperworkDescriptor } from './paperworkPrintState';

function getPrintedByName(user: User): string {
  const metadata = user.user_metadata ?? {};
  return (
    (metadata.full_name as string | undefined)?.trim() ||
    [metadata.first_name, metadata.last_name].filter(Boolean).join(' ').trim() ||
    user.email ||
    'Secretary'
  );
}

/**
 * The single write path for physical print confirmations.
 *
 * Every surface reads the same replicated table, so every surface must also
 * use the same actor metadata, undo behaviour, and pending mutation path.
 */
export async function recordPaperworkPrinted(input: {
  descriptor: PaperworkDescriptor;
  user: User;
  /**
   * The undo toast. Omit it where the record shows on the row with its own Undo (the Overview's
   * print panel), so the secretary has a line that stays instead of a toast that vanishes.
   */
  message?: string;
  undoReason: string;
  undoFailureMessage: string;
}): Promise<ReplicatedPaperworkPrint> {
  const { descriptor, user } = input;
  const record = await replicatedPaperworkPrintsTable.confirmPrinted({
    scope: descriptor.scope,
    reportId: descriptor.reportId,
    coverage: descriptor.coverage as unknown as Record<string, unknown>,
    fingerprint: descriptor.fingerprint,
    printedBy: user.id,
    printedByName: getPrintedByName(user),
  });
  if (input.message) {
    showUndoToast({
      message: input.message,
      onUndo: () => {
        void voidPaperworkPrint({
          recordId: record.id,
          user,
          reason: input.undoReason,
          failureMessage: input.undoFailureMessage,
        });
      },
    });
  }
  return record;
}

/** The single undo path: marks a print record not printed, keeping it in the history. */
export async function voidPaperworkPrint(input: {
  recordId: string;
  user: User;
  reason: string;
  failureMessage: string;
}): Promise<void> {
  try {
    await replicatedPaperworkPrintsTable.voidPrint({
      id: input.recordId,
      voidedBy: input.user.id,
      reason: input.reason,
    });
  } catch {
    toast.error(input.failureMessage);
  }
}
