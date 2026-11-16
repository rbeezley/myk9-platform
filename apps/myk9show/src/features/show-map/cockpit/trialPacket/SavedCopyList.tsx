import { CheckCircle2, Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatRecordDateTime } from '@/lib/format/dates';
import { NOT_RECORDED_LABEL } from '@/lib/format/fallbackLabels';
import type {
  DeliveredPacketRow,
  DeliveredPacketSnapshot,
} from '@/pages/secretary/ReportsPage/deliveredPacketRows';

import type { PaperworkDescriptor } from '../paperworkPrintState';
import { plural } from './usePacketFrame';

/**
 * The copies already sent for one trial day, newest first, and whether the paper in the box
 * matches the newest one. "Mark printed" only ever names the newest copy: an older one was
 * replaced, and printing it would not match what the show team holds.
 */
export function SavedCopyList({
  copies,
  latest,
  onMarkPrinted,
}: {
  copies: readonly DeliveredPacketSnapshot[];
  /** The newest copy's print state for this day, from `useDeliveredPackets`. */
  latest: DeliveredPacketRow | null;
  onMarkPrinted: (descriptor: PaperworkDescriptor) => void;
}) {
  if (copies.length === 0) {
    return <p className="text-sm text-muted-foreground">No copy has been sent for this day yet.</p>;
  }
  return (
    <ul aria-label="Copies already sent" className="flex flex-col gap-2">
      {copies.map(copy => {
        const isLatest = latest?.snapshotId === copy.snapshotId;
        return (
          <li key={copy.snapshotId} className="rounded-md border p-3 text-sm">
            <span className="font-medium">
              Sent {formatRecordDateTime(copy.createdAt) || NOT_RECORDED_LABEL}
            </span>
            <span className="text-muted-foreground">
              {' · '}
              {plural(copy.pageCount, 'page', 'pages')}
              {' · '}
              received by {plural(copy.recipientCount ?? 0, 'official', 'officials')}
            </span>
            {isLatest && latest && <PrintedState row={latest} onMarkPrinted={onMarkPrinted} />}
            {!isLatest && <p className="text-muted-foreground">A newer copy replaced this one.</p>}
          </li>
        );
      })}
    </ul>
  );
}

function PrintedState({
  row,
  onMarkPrinted,
}: {
  row: DeliveredPacketRow;
  onMarkPrinted: (descriptor: PaperworkDescriptor) => void;
}) {
  if (row.printState === 'printed') {
    return (
      <p className="mt-1 inline-flex items-center gap-1 text-success">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Paper matching this copy is marked printed.
      </p>
    );
  }
  const descriptor = row.descriptor;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground">
        {row.printState === 'superseded'
          ? 'The paper that was printed is from an older copy.'
          : 'Not marked printed.'}
      </span>
      {descriptor && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => onMarkPrinted(descriptor)}
        >
          <Printer className="mr-2 size-4" aria-hidden="true" />
          Mark printed
        </Button>
      )}
    </div>
  );
}
