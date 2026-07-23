import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Receipt, MoreHorizontal, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/format';
import { EntryListCard } from './EntryListCard';
import { groupEnrollmentEntriesByDog } from './enrollmentDogGroups';
import { getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EnrollmentCardProps } from './EnrollmentCard.types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  EMPTY_CHECK_DIALOG,
  EMPTY_PARTIAL_DIALOG,
  EMPTY_REFUND_DIALOG,
  PAID_STATUSES,
  resolvePartialPayment,
  resolveRefund,
  type CheckDialog,
  type PartialDialog,
  type RefundDialog,
} from './enrollmentPayment';
import { EnrollmentCheckPaymentDialog } from './EnrollmentCheckPaymentDialog';
import { EnrollmentPartialPaymentDialog } from './EnrollmentPartialPaymentDialog';
import { EnrollmentRefundDialog } from './EnrollmentRefundDialog';
import { EnrollmentEmailDialog } from './EnrollmentEmailDialog';
import { formatConfirmationNumberLabel } from '@/features/registration/confirmationNumberDisplay';

export const EnrollmentCard: React.FC<EnrollmentCardProps> = ({
  group,
  onStatusChange,
  onEntryRefunded,
  onCheckInStatusChange,
  onOpenArmbandDialog,
  onOpenEditEntry,
  onCompEntry,
  onUncompEntry,
  onRemoveEntry,
  showCheckInStatus = true,
  matchingEntryIds,
  onBulkStatusChange,
  onBulkCheckIn,
  onPaymentStatusChange,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
  onSendDecisionEmail,
  lastDecisionEmailedAt,
  lifecycleDecisionEmailStatusMap,
  onReviewLifecycleEmail,
  onPrepareCorrectionEmail,
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
  const dogGroups = useMemo(() => groupEnrollmentEntriesByDog(group.entries), [group.entries]);
  const isPartiallyPaid =
    paidDollars > 0 && paidDollars < totalDollars && !PAID_STATUSES.has(group.paymentStatus);

  const handlePayment = (
    status: PaymentStatus,
    reference?: string | null,
    paid?: number | null,
    refundAmt?: number | null,
    refundNotes?: string | null,
    checkNumber?: string | null
  ) => {
    if (enrollmentId)
      onPaymentStatusChange(
        enrollmentId,
        status,
        reference,
        paid,
        refundAmt,
        refundNotes,
        checkNumber
      );
  };

  const confirmPartialPayment = () => {
    const result = resolvePartialPayment(
      partialDialog.amountPaid,
      totalDollars,
      partialDialog.method,
      partialDialog.checkNumber
    );
    if (!result) return;
    const checkNumber = partialDialog.method === 'check' ? result.reference : null;
    handlePayment(result.status, result.reference, result.amount, null, null, checkNumber);
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
    const result = resolveRefund(
      refundDialog.amount,
      paidDollars,
      refundDialog.method,
      refundDialog.notes
    );
    if (!result) return;
    handlePayment(result.status, null, null, result.amount, result.notes);
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
                  {formatConfirmationNumberLabel(group.confirmationNumber)}
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
                    {/* Grouped into three concerns so this 7-action money menu
                        reads as sections, not one flat list: Mark paid (record a
                        full payment), Adjust (partial / refunds), Reset (back to
                        unpaid). Handlers and dialogs are unchanged. */}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                        Mark paid
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() =>
                          handlePayment(PaymentStatus.PAID_BY_CASH, null, totalDollars)
                        }
                      >
                        Paid in Full: Cash
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setCheckDialog({ open: true, checkNumber: '' })}
                      >
                        Paid in Full: Check…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.PAID_ONLINE)}>
                        Paid in Full: Online
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                        Adjust
                      </DropdownMenuLabel>
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
                      <DropdownMenuItem onClick={() => openRefundDialog(false)}>
                        Refunded…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openRefundDialog(true)}>
                        Partial Refund…
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                        Reset
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => handlePayment(PaymentStatus.PENDING, null, 0)}
                      >
                        Payment Due
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
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
                  <span className="text-xs text-warning font-medium">
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
                {/* No "Waitlist All": real waitlisting is per-class with
                    position/capacity tracked in `waitlist_entries` (see
                    WaitlistManagementPage / useWaitListMutations). This bulk
                    action only writes entry_status, which maps WAITLIST →
                    'submitted' (the entry's pre-decision state), so it never
                    creates membership and the entry stays Pending — same reason
                    Lane 2.2 (#827) omitted bulk Waitlist from the table
                    multi-select bar. */}
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
          <div className="space-y-3">
            {dogGroups.map(dogGroup => {
              const dogHasSearchMatch = dogGroup.entries.some(entry =>
                matchingEntryIds?.has(entry.id)
              );
              return (
                <section
                  key={dogGroup.dogKey}
                  className={cn(
                    'border-t border-border/50 px-4 pt-3 first:border-t-0 first:pt-0',
                    dogHasSearchMatch && 'rounded-lg bg-primary/5 ring-1 ring-primary/30'
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">{dogGroup.dogName}</h3>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {dogHasSearchMatch && <span className="text-primary">Search match</span>}
                      <span>
                        {dogGroup.entries.length}{' '}
                        {dogGroup.entries.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </span>
                  </div>
                  <EntryListCard
                    entries={dogGroup.entries}
                    matchingEntryIds={matchingEntryIds}
                    onStatusChange={onStatusChange}
                    onEntryRefunded={onEntryRefunded}
                    onCheckInStatusChange={onCheckInStatusChange}
                    onOpenArmbandDialog={onOpenArmbandDialog}
                    onOpenEditEntry={onOpenEditEntry}
                    onCompEntry={onCompEntry}
                    onUncompEntry={onUncompEntry}
                    onRemoveEntry={onRemoveEntry}
                    showCheckInStatus={showCheckInStatus}
                    hidePaymentBadge={true}
                    hideHeader={true}
                    emailStatusMap={emailStatusMap}
                    onResendEmail={onResendEmail}
                    isResendDisabled={isResendDisabled}
                    lifecycleDecisionEmailStatusMap={lifecycleDecisionEmailStatusMap}
                    onReviewLifecycleEmail={onReviewLifecycleEmail}
                    onPrepareCorrectionEmail={onPrepareCorrectionEmail}
                  />
                </section>
              );
            })}
          </div>
        </CardContent>
      )}

      <EnrollmentCheckPaymentDialog
        open={checkDialog.open}
        checkNumber={checkDialog.checkNumber}
        onCheckNumberChange={value => setCheckDialog(prev => ({ ...prev, checkNumber: value }))}
        onClose={() => setCheckDialog(EMPTY_CHECK_DIALOG)}
        onConfirm={() => {
          handlePayment(
            PaymentStatus.PAID_BY_CHECK,
            checkDialog.checkNumber || null,
            totalDollars,
            null,
            null,
            checkDialog.checkNumber || null
          );
          setCheckDialog(EMPTY_CHECK_DIALOG);
        }}
      />

      <EnrollmentPartialPaymentDialog
        state={partialDialog}
        onChange={setPartialDialog}
        totalDollars={totalDollars}
        paidDollars={paidDollars}
        onClose={() => setPartialDialog(EMPTY_PARTIAL_DIALOG)}
        onConfirm={confirmPartialPayment}
      />

      <EnrollmentRefundDialog
        state={refundDialog}
        onChange={setRefundDialog}
        paidDollars={paidDollars}
        onClose={() => setRefundDialog(EMPTY_REFUND_DIALOG)}
        onConfirm={confirmRefund}
      />

      <EnrollmentEmailDialog
        open={emailDialogOpen}
        onOpenChange={open => {
          if (!isSendingEmail) setEmailDialogOpen(open);
        }}
        isSending={isSendingEmail}
        ownerName={group.entries[0]?.ownerName}
        message={emailMessage}
        onMessageChange={setEmailMessage}
        onCancel={() => setEmailDialogOpen(false)}
        onSend={async () => {
          if (!onSendDecisionEmail || !enrollmentId) return;
          setIsSendingEmail(true);
          const totalDollarsForEmail =
            group.totalAmountUnit === 'cents' ? group.totalAmount / 100 : group.totalAmount;
          const amountDue = Math.max(0, totalDollarsForEmail - group.paidAmount);
          await onSendDecisionEmail(
            enrollmentId,
            emailMessage.trim() || undefined,
            amountDue > 0 ? amountDue : undefined
          );
          setIsSendingEmail(false);
          setEmailDialogOpen(false);
        }}
      />
    </Card>
  );
};

export default EnrollmentCard;
