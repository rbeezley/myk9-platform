import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronDown, ChevronUp, Receipt, MoreHorizontal, Mail, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/format';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EnrollmentCardProps {
  group: EnrollmentGroup;
  onStatusChange: (entryId: string, status: EntryStatus, withdrawalReason?: string) => void;
  onEntryRefunded?: () => void;
  onCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onCompEntry?: (entryId: string) => void;
  onUncompEntry?: (entryId: string) => void;
  onRemoveEntry: (entryId: string) => void;
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  onBulkCheckIn: (entryIds: string[]) => void;
  onPaymentStatusChange: (
    enrollmentId: string,
    status: PaymentStatus,
    reference?: string | null,
    paidAmount?: number | null,
    refundAmount?: number | null,
    refundNotes?: string | null
  ) => void;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
  onSendDecisionEmail?:
    | ((registrationId: string, message?: string, amountDue?: number) => Promise<void>)
    | undefined;
  lastDecisionEmailedAt?: string | undefined;
}

type CheckDialog = { open: boolean; checkNumber: string };
type PartialDialog = {
  open: boolean;
  amountPaid: string;
  method: 'cash' | 'check';
  checkNumber: string;
};
type RefundDialog = {
  open: boolean;
  amount: string;
  method: 'check_mailed' | 'cash_returned' | 'stripe' | 'other';
  notes: string;
  isPartial: boolean;
};

const EMPTY_CHECK_DIALOG: CheckDialog = { open: false, checkNumber: '' };
const EMPTY_PARTIAL_DIALOG: PartialDialog = {
  open: false,
  amountPaid: '',
  method: 'cash',
  checkNumber: '',
};
const EMPTY_REFUND_DIALOG: RefundDialog = {
  open: false,
  amount: '',
  method: 'check_mailed',
  notes: '',
  isPartial: false,
};

const REFUND_METHODS: { value: RefundDialog['method']; label: string }[] = [
  { value: 'check_mailed', label: 'Check Mailed' },
  { value: 'cash_returned', label: 'Cash Returned' },
  { value: 'stripe', label: 'Stripe (manual)' },
  { value: 'other', label: 'Other' },
];

const PAID_STATUSES = new Set([
  PaymentStatus.PAID_BY_CASH,
  PaymentStatus.PAID_BY_CHECK,
  PaymentStatus.PAID_ONLINE,
]);

export const EnrollmentCard: React.FC<EnrollmentCardProps> = ({
  group,
  onStatusChange,
  onEntryRefunded,
  onCheckInStatusChange,
  onOpenArmbandDialog,
  onCompEntry,
  onUncompEntry,
  onRemoveEntry,
  onBulkStatusChange,
  onBulkCheckIn,
  onPaymentStatusChange,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
  onSendDecisionEmail,
  lastDecisionEmailedAt,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [checkDialog, setCheckDialog] = useState<CheckDialog>(EMPTY_CHECK_DIALOG);
  const [partialDialog, setPartialDialog] = useState<PartialDialog>(EMPTY_PARTIAL_DIALOG);
  const [refundDialog, setRefundDialog] = useState<RefundDialog>(EMPTY_REFUND_DIALOG);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');

  const enrollmentId = group.enrollmentId ?? '';
  const totalDollars =
    group.totalAmountUnit === 'cents' ? group.totalAmount / 100 : group.totalAmount;
  const paidDollars = group.paidAmount;
  const remainingDollars = totalDollars - paidDollars;
  const isPartiallyPaid =
    paidDollars > 0 && paidDollars < totalDollars && !PAID_STATUSES.has(group.paymentStatus);

  const handlePayment = (
    status: PaymentStatus,
    reference?: string | null,
    paid?: number | null,
    refundAmt?: number | null,
    refundNotes?: string | null
  ) => {
    if (enrollmentId)
      onPaymentStatusChange(enrollmentId, status, reference, paid, refundAmt, refundNotes);
  };

  const confirmPartialPayment = () => {
    const amount = parseFloat(partialDialog.amountPaid);
    if (isNaN(amount) || amount <= 0) return;

    let status: PaymentStatus;
    if (amount >= totalDollars) {
      status =
        partialDialog.method === 'check' ? PaymentStatus.PAID_BY_CHECK : PaymentStatus.PAID_BY_CASH;
    } else {
      status = PaymentStatus.PENDING;
    }

    const reference = partialDialog.method === 'check' ? partialDialog.checkNumber || null : null;
    handlePayment(status, reference, amount);
    setPartialDialog(EMPTY_PARTIAL_DIALOG);
  };

  const openRefundDialog = (isPartial: boolean) => {
    setRefundDialog({
      ...EMPTY_REFUND_DIALOG,
      open: true,
      amount: isPartial ? '' : paidDollars.toFixed(2),
      isPartial,
    });
  };

  const confirmRefund = () => {
    const amount = parseFloat(refundDialog.amount);
    if (isNaN(amount) || amount <= 0) return;
    const status =
      !refundDialog.isPartial || amount >= paidDollars
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIAL_REFUND;
    const methodLabel =
      REFUND_METHODS.find(m => m.value === refundDialog.method)?.label ?? refundDialog.method;
    const notes = [methodLabel, refundDialog.notes.trim()].filter(Boolean).join(': ');
    handlePayment(status, null, null, amount, notes || null);
    setRefundDialog(EMPTY_REFUND_DIALOG);
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
            <div className="flex items-center gap-1.5">
              {/* Manual payment recording only exists for enrollment (mail-in)
                  groups. Online-checkout groups have no enrollment row, so the
                  manual options would silently no-op — and "Refunded…" would
                  read like a real card refund. Their status follows Stripe via
                  the per-entry Withdrawn → refund flow. */}
              {!group.enrollmentId ? (
                getPaymentStatusBadge(group.paymentStatus)
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      {getPaymentStatusBadge(group.paymentStatus)}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handlePayment(PaymentStatus.PAID_BY_CASH, null, totalDollars)}
                    >
                      Paid in Full — Cash
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setCheckDialog({ open: true, checkNumber: '' })}
                    >
                      Paid in Full — Check…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.PAID_ONLINE)}>
                      Paid in Full — Online
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        setPartialDialog({
                          open: true,
                          amountPaid: '',
                          method: 'cash',
                          checkNumber: '',
                        })
                      }
                    >
                      Partial Payment…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => openRefundDialog(false)}>
                      Refunded…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openRefundDialog(true)}>
                      Partial Refund…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.PENDING, null, 0)}>
                      Payment Due
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <span className="text-sm font-medium">${totalDollars.toFixed(2)}</span>

              {isPartiallyPaid && (
                <span className="text-xs text-muted-foreground">
                  (${paidDollars.toFixed(2)} paid · ${remainingDollars.toFixed(2)} due)
                </span>
              )}
              {paidDollars > 0 &&
                !isPartiallyPaid &&
                group.paymentStatus === PaymentStatus.PENDING && (
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    ${paidDollars.toFixed(2)} on account
                  </span>
                )}

              {group.refundAmount != null && (
                <span className="text-xs text-info font-medium">
                  ${group.refundAmount.toFixed(2)} refunded
                  {group.refundedAt && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({formatRelativeTime(new Date(group.refundedAt))})
                    </span>
                  )}
                </span>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs px-2">
                  Actions
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    onBulkStatusChange(
                      group.entries.map(e => e.id),
                      EntryStatus.ACCEPTED
                    )
                  }
                >
                  Accept All
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onBulkStatusChange(
                      group.entries.map(e => e.id),
                      EntryStatus.WAITLIST
                    )
                  }
                >
                  Waitlist All
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onBulkStatusChange(
                      group.entries.map(e => e.id),
                      EntryStatus.REJECTED
                    )
                  }
                >
                  Reject All
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onBulkStatusChange(
                      group.entries.map(e => e.id),
                      EntryStatus.MISSING_INFO
                    )
                  }
                >
                  Missing Info
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onBulkCheckIn(group.entries.map(e => e.id))}>
                  Check In All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {onSendDecisionEmail && enrollmentId && (
              <div className="flex items-center gap-1.5">
                {lastDecisionEmailedAt && (
                  <span
                    className="text-xs text-muted-foreground"
                    title={new Date(lastDecisionEmailedAt).toLocaleString()}
                  >
                    Emailed {formatRelativeTime(new Date(lastDecisionEmailedAt))}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs px-2"
                  onClick={() => {
                    setEmailMessage('');
                    setEmailDialogOpen(true);
                  }}
                  title="Send decision email to exhibitor"
                >
                  <Mail className="h-3 w-3" />
                  Email Exhibitor
                </Button>
              </div>
            )}

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
            onEntryRefunded={onEntryRefunded}
            onCheckInStatusChange={onCheckInStatusChange}
            onOpenArmbandDialog={onOpenArmbandDialog}
            onCompEntry={onCompEntry}
            onUncompEntry={onUncompEntry}
            onRemoveEntry={onRemoveEntry}
            hidePaymentBadge={true}
            hideHeader={true}
            emailStatusMap={emailStatusMap}
            onResendEmail={onResendEmail}
            isResendDisabled={isResendDisabled}
          />
        </CardContent>
      )}

      {/* Check payment dialog */}
      <Dialog
        open={checkDialog.open}
        onOpenChange={open => !open && setCheckDialog(EMPTY_CHECK_DIALOG)}
      >
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
            <Button variant="outline" onClick={() => setCheckDialog(EMPTY_CHECK_DIALOG)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                handlePayment(
                  PaymentStatus.PAID_BY_CHECK,
                  checkDialog.checkNumber || null,
                  totalDollars
                );
                setCheckDialog(EMPTY_CHECK_DIALOG);
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
        onOpenChange={open => !open && setPartialDialog(EMPTY_PARTIAL_DIALOG)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Partial Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-sm text-muted-foreground">
              Total due:{' '}
              <span className="font-medium text-foreground">${totalDollars.toFixed(2)}</span>
              {paidDollars > 0 && (
                <>
                  {' '}
                  · Previously paid:{' '}
                  <span className="font-medium text-foreground">${paidDollars.toFixed(2)}</span>
                </>
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

            {(() => {
              const amt = parseFloat(partialDialog.amountPaid);
              if (!partialDialog.amountPaid || isNaN(amt)) return null;
              return (
                <p className="text-xs text-muted-foreground">
                  {amt >= totalDollars
                    ? '✓ Covers full balance — will mark as paid'
                    : `Remaining after payment: $${Math.max(0, totalDollars - amt).toFixed(2)}`}
                </p>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartialDialog(EMPTY_PARTIAL_DIALOG)}>
              Cancel
            </Button>
            <Button
              onClick={confirmPartialPayment}
              disabled={!partialDialog.amountPaid || !(parseFloat(partialDialog.amountPaid) > 0)}
            >
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund dialog */}
      <Dialog
        open={refundDialog.open}
        onOpenChange={open => !open && setRefundDialog(EMPTY_REFUND_DIALOG)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {refundDialog.isPartial ? 'Record Partial Refund' : 'Record Refund'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {paidDollars > 0 && (
              <div className="text-sm text-muted-foreground">
                Amount paid:{' '}
                <span className="font-medium text-foreground">${paidDollars.toFixed(2)}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">
                Refund Amount{' '}
                {!refundDialog.isPartial && (
                  <span className="text-muted-foreground font-normal">(pre-filled from paid)</span>
                )}
              </Label>
              <Input
                id="refund-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount ($)"
                value={refundDialog.amount}
                onChange={e => setRefundDialog(prev => ({ ...prev, amount: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="refund-method">Refund Method</Label>
              <Select
                value={refundDialog.method}
                onValueChange={v =>
                  setRefundDialog(prev => ({ ...prev, method: v as RefundDialog['method'] }))
                }
              >
                <SelectTrigger id="refund-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFUND_METHODS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="refund-notes">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="refund-notes"
                placeholder="e.g. check mailed 5/1/2026"
                value={refundDialog.notes}
                onChange={e => setRefundDialog(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialog(EMPTY_REFUND_DIALOG)}>
              Cancel
            </Button>
            <Button
              onClick={confirmRefund}
              disabled={!refundDialog.amount || !(parseFloat(refundDialog.amount) > 0)}
            >
              Record Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Exhibitor dialog */}
      <Dialog
        open={emailDialogOpen}
        onOpenChange={open => {
          if (!isSendingEmail) setEmailDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email Exhibitor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Sending entry decisions to{' '}
              <strong>{group.entries[0]?.ownerName ?? 'exhibitor'}</strong>.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="email-message">
                Message to exhibitor{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="email-message"
                value={emailMessage}
                onChange={e => setEmailMessage(e.target.value)}
                placeholder="Add any notes, parking info, payment instructions…"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmailDialogOpen(false)}
              disabled={isSendingEmail}
            >
              Cancel
            </Button>
            <Button
              disabled={isSendingEmail}
              onClick={async () => {
                if (!onSendDecisionEmail || !enrollmentId) return;
                setIsSendingEmail(true);
                const totalDollars =
                  group.totalAmountUnit === 'cents' ? group.totalAmount / 100 : group.totalAmount;
                const amountDue = Math.max(0, totalDollars - group.paidAmount);
                await onSendDecisionEmail(
                  enrollmentId,
                  emailMessage.trim() || undefined,
                  amountDue > 0 ? amountDue : undefined
                );
                setIsSendingEmail(false);
                setEmailDialogOpen(false);
              }}
            >
              {isSendingEmail ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send Email'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default EnrollmentCard;
