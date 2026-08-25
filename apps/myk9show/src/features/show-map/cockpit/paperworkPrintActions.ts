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
  message: string;
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
  showUndoToast({
    message: input.message,
    onUndo: () => {
      void replicatedPaperworkPrintsTable
        .voidPrint({ id: record.id, voidedBy: user.id, reason: input.undoReason })
        .catch(() => toast.error(input.undoFailureMessage));
    },
  });
  return record;
}
