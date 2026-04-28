import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronDown, ChevronUp, Receipt, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EntryListCard } from './EntryListCard';
import { getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@myk9/core';
import type { EmailLogEntry } from '@/hooks/useEmailStatus';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EnrollmentCardProps {
  group: EnrollmentGroup;
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  onCheckInStatusChange: (entry: EntryManagementEntry, cls: EntryClass, status: CheckInStatus) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onCompEntry?: (entryId: string) => void;
  onUncompEntry?: (entryId: string) => void;
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  onBulkCheckIn: (entryIds: string[]) => void;
  onPaymentStatusChange: (
    enrollmentId: string,
    status: PaymentStatus,
    reference?: string | null,
    paidAmount?: number | null
  ) => void;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
}

type CheckDialog = { open: boolean; checkNumber: string };
type PartialDialog = {
  open: boolean;
  amountPaid: string;
  method: 'cash' | 'check';
  checkNumber: string;
};

export const EnrollmentCard: React.FC<EnrollmentCardProps> = ({
  group,
  onStatusChange,
  onCheckInStatusChange,
  onOpenArmbandDialog,
  onCompEntry,
  onUncompEntry,
  onBulkStatusChange,
  onBulkCheckIn,
  onPaymentStatusChange,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [checkDialog, setCheckDialog] = useState<CheckDialog>({ open: false, checkNumber: '' });
  const [partialDialog, setPartialDialog] = useState<PartialDialog>({
    open: false,
    amountPaid: '',
    method: 'cash',
    checkNumber: '',
  });

  const enrollmentId = group.enrollmentId ?? '';

  // Compute totals in dollars
  const totalDollars =
    group.totalAmountUnit === 'cents' ? group.totalAmount / 100 : group.totalAmount;
  const paidDollars = group.paidAmount;
  const remainingDollars = totalDollars - paidDollars;
  const isPartiallyPaid =
    paidDollars > 0 &&
    paidDollars < totalDollars &&
    group.paymentStatus !== PaymentStatus.PAID_BY_CASH &&
    group.paymentStatus !== PaymentStatus.PAID_BY_CHECK &&
    group.paymentStatus !== PaymentStatus.PAID_ONLINE;

  const handlePayment = (status: PaymentStatus, reference?: string | null, paid?: number | null) => {
    if (enrollmentId) onPaymentStatusChange(enrollmentId, status, reference, paid);
  };

  const confirmPartialPayment = () => {
    const amount = parseFloat(partialDialog.amountPaid);
    if (isNaN(amount) || amount <= 0) return;

    const isFullPayment = amount >= totalDollars;
    const status = isFullPayment
      ? partialDialog.method === 'check'
        ? PaymentStatus.PAID_BY_CHECK
        : PaymentStatus.PAID_BY_CASH
      : PaymentStatus.PENDING; // stays pending until fully paid

    const reference = partialDialog.method === 'check' ? partialDialog.checkNumber || null : null;
    handlePayment(status, reference, amount);
    setPartialDialog({ open: false, amountPaid: '', method: 'cash', checkNumber: '' });
  };

  return (
    <Card className="border border-border/60">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <span className="font-semibold text-sm">{group.handlerName}</span>
              {group.confirmationNumber && (
                <span className="text-xs text-muted-foreground ml-2">
                  #{group.confirmationNumber}
                </span>
              )}
              {group.paymentReference && (
                <span className="text-xs text-muted-foreground ml-2 font-mono">
                  {group.paymentReference.slice(0, 16)}&hellip;
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Payment status + amount display */}
            <div className="flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                    {getPaymentStatusBadge(group.paymentStatus)}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.PAID_BY_CASH, null, totalDollars)}>
                    Paid in Full — Cash
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCheckDialog({ open: true, checkNumber: '' })}>
                    Paid in Full — Check…
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.PAID_ONLINE)}>
                    Paid in Full — Online
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPartialDialog({ open: true, amountPaid: '', method: 'cash', checkNumber: '' })}>
                    Partial Payment…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.REFUNDED)}>
                    Refunded
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.PENDING, null, 0)}>
                    Pending
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <span className="text-sm font-medium">${totalDollars.toFixed(2)}</span>

              {/* Partial payment balance */}
              {isPartiallyPaid && (
                <span className="text-xs text-muted-foreground">
                  (${paidDollars.toFixed(2)} paid · ${remainingDollars.toFixed(2)} due)
                </span>
              )}
              {paidDollars > 0 && !isPartiallyPaid && group.paymentStatus === PaymentStatus.PENDING && (
                <span className="text-xs text-amber-600 font-medium">
                  ${paidDollars.toFixed(2)} on account
                </span>
              )}
            </div>

            {/* Enrollment-level bulk actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs px-2">
                  Actions
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onBulkStatusChange(group.entries.map(e => e.id), EntryStatus.ACCEPTED)}>
                  Accept All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkStatusChange(group.entries.map(e => e.id), EntryStatus.WAITLIST)}>
                  Waitlist All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkStatusChange(group.entries.map(e => e.id), EntryStatus.REJECTED)}>
                  Reject All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkStatusChange(group.entries.map(e => e.id), EntryStatus.MISSING_INFO)}>
                  Missing Info
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onBulkCheckIn(group.entries.map(e => e.id))}>
                  Check In All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(v => !v)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className={cn('pt-0 px-0 pb-2')}>
          <EntryListCard
            entries={group.entries}
            onStatusChange={onStatusChange}
            onCheckInStatusChange={onCheckInStatusChange}
            onOpenArmbandDialog={onOpenArmbandDialog}
            onCompEntry={onCompEntry}
            onUncompEntry={onUncompEntry}
            hidePaymentBadge={true}
            hideHeader={true}
            emailStatusMap={emailStatusMap}
            onResendEmail={onResendEmail}
            isResendDisabled={isResendDisabled}
          />
        </CardContent>
      )}

      {/* Full-payment check number dialog */}
      <Dialog open={checkDialog.open} onOpenChange={open => !open && setCheckDialog({ open: false, checkNumber: '' })}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Check Payment</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Check number (optional)"
              value={checkDialog.checkNumber}
              onChange={e => setCheckDialog(prev => ({ ...prev, checkNumber: e.target.value }))}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckDialog({ open: false, checkNumber: '' })}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                handlePayment(PaymentStatus.PAID_BY_CHECK, checkDialog.checkNumber || null, totalDollars);
                setCheckDialog({ open: false, checkNumber: '' });
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partial payment dialog */}
      <Dialog
        open={partialDialog.open}
        onOpenChange={open => !open && setPartialDialog({ open: false, amountPaid: '', method: 'cash', checkNumber: '' })}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Partial Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-sm text-muted-foreground">
              Total due: <span className="font-medium text-foreground">${totalDollars.toFixed(2)}</span>
              {paidDollars > 0 && (
                <> · Previously paid: <span className="font-medium text-foreground">${paidDollars.toFixed(2)}</span></>
              )}
            </div>

            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount paid ($)"
              value={partialDialog.amountPaid}
              onChange={e => setPartialDialog(prev => ({ ...prev, amountPaid: e.target.value }))}
              autoFocus
            />

            <div className="flex gap-2">
              <Button
                variant={partialDialog.method === 'cash' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setPartialDialog(prev => ({ ...prev, method: 'cash' }))}
              >
                Cash
              </Button>
              <Button
                variant={partialDialog.method === 'check' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setPartialDialog(prev => ({ ...prev, method: 'check' }))}
              >
                Check
              </Button>
            </div>

            {partialDialog.method === 'check' && (
              <Input
                placeholder="Check number (optional)"
                value={partialDialog.checkNumber}
                onChange={e => setPartialDialog(prev => ({ ...prev, checkNumber: e.target.value }))}
              />
            )}

            {partialDialog.amountPaid && !isNaN(parseFloat(partialDialog.amountPaid)) && (
              <p className="text-xs text-muted-foreground">
                {parseFloat(partialDialog.amountPaid) >= totalDollars
                  ? '✓ Covers full balance — will mark as paid'
                  : `Remaining after payment: $${Math.max(0, totalDollars - parseFloat(partialDialog.amountPaid)).toFixed(2)}`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPartialDialog({ open: false, amountPaid: '', method: 'cash', checkNumber: '' })}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPartialPayment}
              disabled={!partialDialog.amountPaid || isNaN(parseFloat(partialDialog.amountPaid)) || parseFloat(partialDialog.amountPaid) <= 0}
            >
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default EnrollmentCard;
