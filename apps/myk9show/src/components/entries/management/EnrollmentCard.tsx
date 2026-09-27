import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Receipt, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/format';
import { EntryListCard } from './EntryListCard';
import { groupEnrollmentEntriesByDog } from './enrollmentDogGroups';
import { getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import { PaymentStatus } from '@/types/show-registration-types';
import type { EnrollmentCardProps } from './EnrollmentCard.types';
import { EnrollmentBulkStatusItems } from './EnrollmentBulkStatusItems';
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
  EMPTY_FULL_PAYMENT_DIALOG,
  netReceivedDollars,
  EMPTY_PARTIAL_DIALOG,
  EMPTY_REFUND_DIALOG,
  resolvePartialPayment,
  resolveRefund,
  type FullPaymentDialog,
  type PartialDialog,
  type RefundDialog,
} from './enrollmentPayment';
import { EnrollmentFullPaymentDialog } from './EnrollmentFullPaymentDialog';
import { EnrollmentPartialPaymentDialog } from './EnrollmentPartialPaymentDialog';
import { EnrollmentRefundDialog } from './EnrollmentRefundDialog';
import { EnrollmentEmailDialog } from './EnrollmentEmailDialog';
import { formatConfirmationNumberLabel } from '@/features/registration/confirmationNumberDisplay';
import { EnrollmentCommunicationSection } from './EnrollmentCommunicationSection';

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
  paymentLedger,
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
  const [fullDialog, setFullDialog] = useState<FullPaymentDialog>(EMPTY_FULL_PAYMENT_DIALOG);
  const [partialDialog, setPartialDialog] = useState<PartialDialog>(EMPTY_PARTIAL_DIALOG);
  const [refundDialog, setRefundDialog] = useState<RefundDialog>(EMPTY_REFUND_DIALOG);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');

  const enrollmentId = group.enrollmentId ?? '';
  const totalDollars =
    group.totalAmountUnit === 'cents' ? group.totalAmount / 100 : group.totalAmount;
  // Net received (MYK9-677): what the club still holds, the figure
  // record_enrollment_payment caps refunds by and charges "Paid in Full" from.
  const paidDollars = netReceivedDollars(group);
  const remainingDollars = totalDollars - paidDollars;
  const dogGroups = useMemo(() => groupEnrollmentEntriesByDog(group.entries), [group.entries]);
  // Partial payment is a fact about the MONEY, not about the headline label: a
  // group can read "Paid by check" while only part of the total has arrived, and
  // gating this on the status hid the shortfall exactly when it mattered
  // (MYK9-495 round 2).
  const isPartiallyPaid = paidDollars > 0 && paidDollars < totalDollars;

  // Online money is not the desk's (no ledger row), but the server runs the
  // same entries cascade as a desk payment (MYK9-773).
  const markPaidOnline = () => {
    if (enrollmentId) void paymentLedger.markPaidOnline(enrollmentId);
  };

  // MYK9-677: cash and check money goes through the payments ledger, one row
  // per payment with the day it was received.
  const today = paymentLedger.todayInShowZone;
  const openFullPayment = (method: FullPaymentDialog['method']) =>
    setFullDialog({ open: true, method, checkNumber: '', receivedOn: today });

  const confirmFullPayment = () => {
    if (!enrollmentId || !fullDialog.receivedOn) return;
    void paymentLedger.record(enrollmentId, {
      kind: 'payment',
      method: fullDialog.method,
      amount: null,
      receivedOn: fullDialog.receivedOn,
      reference: fullDialog.method === 'check' ? fullDialog.checkNumber : null,
    });
    setFullDialog(EMPTY_FULL_PAYMENT_DIALOG);
  };

  const confirmPartialPayment = () => {
    const result = resolvePartialPayment(
      partialDialog.amountPaid,
      partialDialog.method,
      partialDialog.checkNumber,
      partialDialog.receivedOn
    );
    if (!result || !enrollmentId) return;
    void paymentLedger.record(enrollmentId, result);
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
      refundDialog.notes,
      today
    );
    if (!result || !enrollmentId) return;
    void paymentLedger.record(enrollmentId, result);
    setRefundDialog(EMPTY_REFUND_DIALOG);
  };

  return (
    <Card className="border border-border/60">
      <CardContent className="p-0">
        <section aria-labelledby="focused-registration-entries">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <h3 id="focused-registration-entries" className="font-semibold">
                Entries
              </h3>
              <p className="text-sm text-muted-foreground">
                {group.handlerName}
                {group.confirmationNumber && (
                  <> · {formatConfirmationNumberLabel(group.confirmationNumber)}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="min-h-11 gap-1 px-3">
                    Actions
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <EnrollmentBulkStatusItems
                    entries={group.entries}
                    onBulkStatusChange={onBulkStatusChange}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11"
                onClick={() => setExpanded(value => !value)}
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {expanded && (
            <div className="space-y-3 border-t border-border/50 px-4 py-3">
              {dogGroups.map(dogGroup => {
                const dogHasSearchMatch = dogGroup.entries.some(entry =>
                  matchingEntryIds?.has(entry.id)
                );
                return (
                  <section
                    key={dogGroup.dogKey}
                    className={cn(
                      'border-t border-border/50 pt-3 first:border-t-0 first:pt-0',
                      dogHasSearchMatch && 'rounded-lg bg-primary/5 ring-1 ring-primary/30'
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold">{dogGroup.dogName}</h4>
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
          )}
        </section>
      </CardContent>

      <CardHeader className="border-t border-border/60 px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <h3 className="font-semibold">Payment</h3>
              <span className="text-sm text-muted-foreground">{group.handlerName}</span>
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

          <div className="flex flex-wrap items-center gap-2">
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
                      <DropdownMenuItem onClick={() => openFullPayment('cash')}>
                        Paid in Full: Cash…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openFullPayment('check')}>
                        Paid in Full: Check…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={markPaidOnline}>
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
                            receivedOn: today,
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
                        onClick={() => {
                          if (enrollmentId)
                            void paymentLedger.record(enrollmentId, { kind: 'reversal' });
                        }}
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
          </div>
        </div>
      </CardHeader>

      <EnrollmentCommunicationSection
        lastDecisionEmailedAt={lastDecisionEmailedAt}
        canSendDecisionEmail={Boolean(onSendDecisionEmail && enrollmentId)}
        onEmail={() => {
          setEmailMessage('');
          setEmailDialogOpen(true);
        }}
      />

      <EnrollmentFullPaymentDialog
        state={fullDialog}
        onChange={setFullDialog}
        balanceDollars={Math.max(0, remainingDollars)}
        todayInShowZone={today}
        onClose={() => setFullDialog(EMPTY_FULL_PAYMENT_DIALOG)}
        onConfirm={confirmFullPayment}
      />

      <EnrollmentPartialPaymentDialog
        state={partialDialog}
        onChange={setPartialDialog}
        totalDollars={totalDollars}
        paidDollars={paidDollars}
        todayInShowZone={today}
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
