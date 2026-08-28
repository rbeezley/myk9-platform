import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckInStatusIndicator } from '@/components/common/CheckInStatusIndicator';
import { getStatusDescriptor } from '@/components/status';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Users,
  Hash,
  MessageSquare,
  Gift,
  ChevronDown,
  Trash2,
  CreditCard,
  PencilLine,
} from 'lucide-react';
import { EntryStatus } from '@/types/show-registration-types';
import {
  getEffectivePaymentStatus,
  getEntryStatusBadge,
  getPaymentStatusBadge,
} from '@/utils/entryManagementUtils';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EmailStatusIcon } from '@/components/entries/EmailStatusIcon';
import { CHECKIN_STATUSES } from '@myk9/core';
import { WithdrawalReasonDialog } from './WithdrawalReasonDialog';
import { RefundEntryDialog } from './RefundEntryDialog';
import { isStripeRefundable } from './refundEligibility';
import { RequestPaymentDialog } from './RequestPaymentDialog';
import { isPaymentRequestable } from './paymentRequestEligibility';
import { EntryDecisionEmailStatusBadge } from '@/features/lifecycle-emails';
import type { EntryListCardProps } from './EntryListCard.types';
import { EntryStatusPopover } from './EntryStatusPopover';

export const EntryListCard: React.FC<EntryListCardProps> = ({
  entries,
  onStatusChange,
  onCheckInStatusChange,
  onOpenArmbandDialog,
  onOpenEditEntry,
  onCompEntry,
  onUncompEntry,
  onRemoveEntry,
  showCheckInStatus = true,
  matchingEntryIds,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
  hidePaymentBadge,
  hideHeader,
  onEntryRefunded,
  onPaymentRequested,
  lifecycleDecisionEmailStatusMap,
  onReviewLifecycleEmail,
  onPrepareCorrectionEmail,
}) => {
  const [withdrawalDialog, setWithdrawalDialog] = useState<{
    open: boolean;
    entryId: string | null;
  }>({ open: false, entryId: null });
  const [removeDialog, setRemoveDialog] = useState<{
    open: boolean;
    entry: EntryManagementEntry | null;
  }>({ open: false, entry: null });
  const [refundDialog, setRefundDialog] = useState<{
    open: boolean;
    entry: EntryManagementEntry | null;
  }>({ open: false, entry: null });
  const [requestPaymentDialog, setRequestPaymentDialog] = useState<{
    open: boolean;
    entry: EntryManagementEntry | null;
  }>({ open: false, entry: null });

  const openWithdrawalDialog = (entryId: string) => {
    setWithdrawalDialog({ open: true, entryId });
  };

  const confirmWithdrawal = (reason: string) => {
    const entryId = withdrawalDialog.entryId;
    if (entryId) {
      onStatusChange(entryId, EntryStatus.CANCELLED, reason);
      // Withdrawn = refund due (April status model): chain straight into the
      // refund dialog when the entry was paid online and not yet refunded.
      const entry = entries.find(e => e.id === entryId);
      if (entry && isStripeRefundable(entry)) {
        setRefundDialog({ open: true, entry });
      }
    }
    setWithdrawalDialog({ open: false, entryId: null });
  };

  const confirmRemoveEntry = () => {
    if (removeDialog.entry) {
      onRemoveEntry(removeDialog.entry.id);
    }
    setRemoveDialog({ open: false, entry: null });
  };

  const entryList = (
    <div className="space-y-2">
      {entries.map(entry => (
        <div
          key={entry.id}
          className={cn(
            'rounded-lg border p-4 transition-colors hover:bg-muted/50',
            matchingEntryIds?.has(entry.id) && 'border-primary/50 bg-primary/5'
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">{entry.dogName}</span>
            {matchingEntryIds?.has(entry.id) && (
              <span className="text-xs font-medium text-primary">Search match</span>
            )}

            {entry.armbandNumber ? (
              <button
                className="inline-flex min-h-11 cursor-pointer items-center gap-0.5 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpenArmbandDialog(entry)}
                // WCAG 2.5.3: the visible text is the armband number, so the
                // accessible name has to start with it.
                aria-label={`${entry.armbandNumber}, change armband for ${entry.dogName}`}
                title="Change armband"
              >
                <Badge variant="outline" className="font-mono">
                  {entry.armbandNumber}
                </Badge>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            ) : (
              <button
                className="inline-flex min-h-11 items-center gap-1 rounded border border-dashed border-border/50 px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpenArmbandDialog(entry)}
                aria-label={`Assign armband to ${entry.dogName}`}
              >
                <Hash className="h-3 w-3" aria-hidden />
                Assign
              </button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto min-h-11 px-2 text-muted-foreground"
              aria-label={`Edit entry for ${entry.dogName}`}
              onClick={() => onOpenEditEntry?.(entry)}
              disabled={!onOpenEditEntry}
            >
              <PencilLine className="h-4 w-4" />
              <span className="sr-only">Edit entry</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 px-2 text-muted-foreground hover:text-destructive"
              aria-label={`Remove entry for ${entry.dogName}`}
              onClick={() => setRemoveDialog({ open: true, entry })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
            <span>Owner: {entry.ownerName}</span>
            <span>Handler: {entry.handlerName}</span>
            <span>
              Fee: ${entry.totalFee} (Paid: ${entry.paidAmount})
            </span>

            {entry.comped ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1">
                    <Badge className="bg-info/10 text-info ">
                      <Gift className="h-3 w-3 mr-1" />
                      Comped
                    </Badge>
                    {onUncompEntry && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => onUncompEntry(entry.id)}
                        aria-label={`Undo comp for ${entry.dogName}`}
                      >
                        Undo
                      </Button>
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{entry.compedReason || 'No reason provided'}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              onCompEntry && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onCompEntry(entry.id)}
                  aria-label={`Comp entry for ${entry.dogName}`}
                >
                  <Gift className="h-3 w-3 mr-1" />
                  Comp
                </Button>
              )
            )}

            {!hidePaymentBadge && getPaymentStatusBadge(getEffectivePaymentStatus(entry))}

            {emailStatusMap && (
              <EmailStatusIcon
                status={emailStatusMap[entry.registrationId]?.status}
                errorMessage={emailStatusMap[entry.registrationId]?.error_message}
                onResend={onResendEmail ? () => onResendEmail(entry.registrationId) : undefined}
                resendDisabled={isResendDisabled?.(entry.registrationId)}
              />
            )}

            {onReviewLifecycleEmail && onPrepareCorrectionEmail ? (
              <EntryDecisionEmailStatusBadge
                entry={entry}
                status={lifecycleDecisionEmailStatusMap?.[entry.id]}
                onReviewReady={onReviewLifecycleEmail}
                onPrepareCorrection={onPrepareCorrectionEmail}
              />
            ) : null}

            {entry.notes && (
              <Badge variant="outline" className="text-info ">
                <MessageSquare className="h-3 w-3 mr-1" />
                Notes
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            {entry.classes.map(cls => (
              <div key={cls.id} className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-muted-foreground font-medium min-w-[120px]">{cls.name}:</span>

                {/* Moved entries remain read-only; the status popover owns only
                    the frequent transitions and leaves check-in independent. */}
                {entry.entryStatus === EntryStatus.MOVED ? (
                  <div className="flex items-center gap-1.5">
                    {getEntryStatusBadge(entry.entryStatus)}
                    {entry.notes && (
                      <span className="text-xs text-muted-foreground">{entry.notes}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <EntryStatusPopover
                      entry={entry}
                      entryClassName={cls.name}
                      onStatusChange={onStatusChange}
                      additionalContent={
                        <>
                          <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                            Other entry actions
                          </p>
                          <button
                            type="button"
                            role="menuitem"
                            data-status-popover-action
                            className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                            onClick={() => openWithdrawalDialog(entry.id)}
                          >
                            Withdrawn
                          </button>
                          {(isPaymentRequestable(entry) || isStripeRefundable(entry)) && (
                            <>
                              <p className="mt-2 px-2 pb-1 text-xs font-medium text-muted-foreground">
                                Payment
                              </p>
                              {isPaymentRequestable(entry) && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  data-status-popover-action
                                  className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                                  onClick={() => setRequestPaymentDialog({ open: true, entry })}
                                >
                                  <CreditCard className="h-4 w-4" aria-hidden />
                                  Request payment…
                                </button>
                              )}
                              {isStripeRefundable(entry) && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  data-status-popover-action
                                  className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                                  onClick={() => setRefundDialog({ open: true, entry })}
                                >
                                  <CreditCard className="h-4 w-4" aria-hidden />
                                  Refund payment…
                                </button>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            role="menuitem"
                            data-status-popover-action
                            className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-destructive hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                            onClick={() => setRemoveDialog({ open: true, entry })}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                            Remove Entry
                          </button>
                        </>
                      }
                    />
                    {entry.entryStatus === EntryStatus.CANCELLED && entry.withdrawalReason && (
                      <span className="text-xs text-muted-foreground pl-0.5">
                        {entry.withdrawalReason}
                      </span>
                    )}
                  </div>
                )}

                {/* Check-in has its own high-throughput desk. Keep this legacy
                    control for callers that still need it, but do not duplicate
                    it inside the registration cockpit. */}
                {showCheckInStatus && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded border border-border/40 px-1.5 transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`${getStatusDescriptor('entry', cls.checkInStatus || 'no-status').label}, change check-in status for ${entry.dogName} in ${cls.name}`}
                      >
                        <CheckInStatusIndicator
                          status={cls.checkInStatus || 'no-status'}
                          size="sm"
                          showLabel={true}
                          showTooltip={false}
                        />
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {CHECKIN_STATUSES.map(status => (
                        <DropdownMenuItem
                          key={status}
                          onClick={() => onCheckInStatusChange(entry, cls, status)}
                        >
                          {getStatusDescriptor('entry', status).label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {entries.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No entries match the current filters</p>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      {hideHeader ? (
        <div className="px-4 py-2">{entryList}</div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Entries ({entries.length})</CardTitle>
          </CardHeader>
          <CardContent>{entryList}</CardContent>
        </Card>
      )}
      <WithdrawalReasonDialog
        open={withdrawalDialog.open}
        onOpenChange={open =>
          setWithdrawalDialog(open ? prev => prev : { open: false, entryId: null })
        }
        onConfirm={confirmWithdrawal}
      />
      <RefundEntryDialog
        open={refundDialog.open}
        onOpenChange={open => setRefundDialog(open ? prev => prev : { open: false, entry: null })}
        entry={refundDialog.entry}
        onRefunded={() => onEntryRefunded?.()}
      />
      <RequestPaymentDialog
        open={requestPaymentDialog.open}
        onOpenChange={open =>
          setRequestPaymentDialog(open ? prev => prev : { open: false, entry: null })
        }
        entry={requestPaymentDialog.entry}
        onRequested={() => onPaymentRequested?.()}
      />
      <AlertDialog
        open={removeDialog.open}
        onOpenChange={open => !open && setRemoveDialog({ open: false, entry: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {removeDialog.entry?.dogName ?? 'this dog'} from{' '}
              {removeDialog.entry?.classes[0]?.name ?? 'this class'}. Use this for mistaken or
              duplicate entries; use Pulled or Withdrawn when the entry should stay in records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmRemoveEntry}
            >
              Remove Entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

export default EntryListCard;
