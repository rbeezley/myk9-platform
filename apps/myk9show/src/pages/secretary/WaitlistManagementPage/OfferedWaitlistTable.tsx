/**
 * The Waitlist tab's Offered group (MYK9-1001): every open offer in scope, so a
 * secretary can track an offer and take it back without leaving the tab. An
 * offered row is waiting for payment by definition; a payment resolves it to
 * accepted and it leaves this list.
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dog, Send, Undo2 } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { formatOfferDeadline } from '@/lib/format/offerDeadline';
import { formatTrialLabel } from './trialLabel';
import type { ActionDialogState, WaitlistOffer } from './types';

interface OfferedWaitlistTableProps {
  offers: WaitlistOffer[];
  onSetActionDialog: (state: ActionDialogState) => void;
  now?: Date;
}

/** Where the offer stands, in the secretary's words. */
function describeOfferPayment(offer: WaitlistOffer, now: Date): string {
  if (offer.promoted_entry_paid) return 'Paid, being confirmed';
  const deadline = offer.offer_expires_at ? Date.parse(offer.offer_expires_at) : Number.NaN;
  if (Number.isFinite(deadline) && deadline <= now.getTime()) return 'Not paid in time, closing';
  return offer.joined_via === 'mail_in' ? 'Waiting for mailed payment' : 'Waiting for payment';
}

function buildColumns(
  now: Date,
  onWithdraw: (offer: WaitlistOffer) => void
): ColumnDef<WaitlistOffer, unknown>[] {
  return [
    {
      id: 'dog',
      header: 'Dog',
      accessorFn: row => row.dog?.call_name ?? row.dog?.name ?? '',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Dog className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">
            {row.original.dog?.call_name || row.original.dog?.name || 'Unknown Dog'}
          </span>
        </div>
      ),
    },
    {
      id: 'class',
      header: 'Class',
      accessorFn: row => row.class?.name ?? '',
      // The trial too: a dog offered the same class in two trials would read as two equal rows.
      cell: ({ row }) => {
        const trial = formatTrialLabel({
          name: row.original.trial_name,
          date: row.original.trial_date,
        });
        return (
          <div>
            <span>{row.original.class?.name}</span>
            {trial && <p className="text-xs text-muted-foreground">{trial}</p>}
          </div>
        );
      },
    },
    {
      id: 'offered',
      header: 'Offered',
      accessorFn: row => row.offered_at ?? '',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatOfferDeadline(row.original.offered_at, row.original.trial_timezone) ?? 'Unknown'}
        </span>
      ),
    },
    {
      id: 'expires',
      header: 'Pay by',
      accessorFn: row => row.offer_expires_at ?? '',
      cell: ({ row }) => (
        <span className="text-sm">
          {formatOfferDeadline(row.original.offer_expires_at, row.original.trial_timezone) ??
            'Unknown'}
        </span>
      ),
    },
    {
      id: 'payment',
      header: 'Payment',
      accessorFn: row => describeOfferPayment(row, now),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) =>
        row.original.promoted_entry_paid ? null : (
          <Button variant="outline" onClick={() => onWithdraw(row.original)}>
            <Undo2 className="mr-1 h-4 w-4" />
            Withdraw offer
          </Button>
        ),
      meta: { interactive: true },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

export function OfferedWaitlistTable({
  offers,
  onSetActionDialog,
  now,
}: OfferedWaitlistTableProps) {
  // "Not paid in time" is judged against when this list was first drawn; the expiry job closes a
  // lapsed offer within minutes, and the row then leaves the list.
  const [drawnAt] = useState(() => new Date());
  const at = now ?? drawnAt;
  const columns = useMemo(
    () =>
      buildColumns(at, offer =>
        onSetActionDialog({ open: true, action: 'withdraw', entry: offer })
      ),
    [at, onSetActionDialog]
  );

  return (
    <Card data-testid="waitlist-offered-group">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Offered ({offers.length})
        </CardTitle>
        <CardDescription>
          Spots offered and waiting for payment. Times are in each trial&apos;s time zone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable tableId="waitlist-offered" columns={columns} data={offers} loading={false} />
      </CardContent>
    </Card>
  );
}
