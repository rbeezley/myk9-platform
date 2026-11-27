import type { ComponentProps } from 'react';

import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { EntryEditDialog } from './EntryEditDialog';

export type EditDialogEntry = ComponentProps<typeof EntryEditDialog>['entry'];

/**
 * The stored entry as the entry sheet reads it: the one mapping Entry Management's "Change
 * handler" and Show Desk's share, so the sheet shows the same classes either way (MYK9-1940).
 */
export function toEditDialogEntry(entry: EntryManagementEntry, showName: string): EditDialogEntry {
  return {
    id: entry.id,
    showId: entry.showId,
    showName,
    dogName: entry.dogName,
    currentStatus: entry.rawEntryStatus ?? entry.entryStatus,
    createdAt: entry.submittedAt.toISOString(),
    handler: entry.handlerName,
    classes: entry.classes.map(cls => ({
      id: cls.id,
      name: cls.name,
      number: cls.number,
      fee: cls.fee,
      status: cls.status,
      // MYK9-632: the card behind this sheet already renders this reason
      // (`removalSummaryLine`); the sheet must not go back to the wire for a
      // value the page has in hand, nor read differently from the card.
      withdrawalReasonCode: cls.withdrawalReasonCode ?? entry.withdrawalReasonCode,
      handler: entry.handlerName,
      handlerId: cls.handlerId ?? entry.handlerId ?? null,
      ...(cls.trialType !== undefined ? { trialType: cls.trialType } : {}),
      ...(cls.jumpHeight !== undefined ? { jumpHeight: cls.jumpHeight } : {}),
    })),
  };
}
