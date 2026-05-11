import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Hash, MessageSquare, Gift, ChevronDown, Trash2 } from 'lucide-react';
import { EntryStatus } from '@/types/show-registration-types';
import { getEntryStatusBadge, getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import { EmailStatusIcon } from '@/components/entries/EmailStatusIcon';
import type { EmailLogEntry } from '@/hooks/useEmailStatus';
import type { CheckInStatus } from '@myk9/core';
import { CHECKIN_STATUS } from '@myk9/core';
import { WithdrawalReasonDialog } from './WithdrawalReasonDialog';

interface EntryListCardProps {
  entries: EntryManagementEntry[];
  onStatusChange: (entryId: string, status: EntryStatus, withdrawalReason?: string) => void;
  onCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onCompEntry?: ((entryId: string) => void) | undefined;
  onUncompEntry?: ((entryId: string) => void) | undefined;
  onRemoveEntry: (entryId: string) => void;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
  hidePaymentBadge?: boolean | undefined;
  /** Suppress the Card wrapper and title — use when nested inside EnrollmentCard */
  hideHeader?: boolean | undefined;
}

export const EntryListCard: React.FC<EntryListCardProps> = ({
  entries,
  onStatusChange,
  onCheckInStatusChange,
  onOpenArmbandDialog,
  onCompEntry,
  onUncompEntry,
  onRemoveEntry,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
  hidePaymentBadge,
  hideHeader,
}) => {
  const [withdrawalDialog, setWithdrawalDialog] = useState<{
    open: boolean;
    entryId: string | null;
  }>({ open: false, entryId: null });
  const [removeDialog, setRemoveDialog] = useState<{
    open: boolean;
    entry: EntryManagementEntry | null;
  }>({ open: false, entry: null });

  const openWithdrawalDialog = (entryId: string) => {
    setWithdrawalDialog({ open: true, entryId });
  };

  const confirmWithdrawal = (reason: string) => {
    if (withdrawalDialog.entryId) {
      onStatusChange(withdrawalDialog.entryId, EntryStatus.CANCELLED, reason);
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
        <div key={entry.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">{entry.dogName}</span>

            {entry.armbandNumber ? (
              <button
                className="inline-flex items-center gap-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onOpenArmbandDialog(entry)}
                title="Change armband"
              >
                <Badge variant="outline" className="font-mono">
                  {entry.armbandNumber}
                </Badge>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            ) : (
              <button
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/50 rounded px-1.5 py-0.5"
                onClick={() => onOpenArmbandDialog(entry)}
              >
                <Hash className="h-3 w-3" />
                Assign
              </button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-8 px-2 text-muted-foreground hover:text-destructive"
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
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      <Gift className="h-3 w-3 mr-1" />
                      Comped
                    </Badge>
                    {onUncompEntry && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => onUncompEntry(entry.id)}
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
                  className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onCompEntry(entry.id)}
                >
                  <Gift className="h-3 w-3 mr-1" />
                  Comp
                </Button>
              )
            )}

            {!hidePaymentBadge && getPaymentStatusBadge(entry.paymentStatus)}

            {emailStatusMap && (
              <EmailStatusIcon
                status={emailStatusMap[entry.registrationId]?.status}
                errorMessage={emailStatusMap[entry.registrationId]?.error_message}
                onResend={onResendEmail ? () => onResendEmail(entry.registrationId) : undefined}
                resendDisabled={isResendDisabled?.(entry.registrationId)}
              />
            )}

            {entry.notes && (
              <Badge variant="outline" className="text-blue-600">
                <MessageSquare className="h-3 w-3 mr-1" />
                Notes
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            {entry.classes.map(cls => (
              <div key={cls.id} className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-muted-foreground font-medium min-w-[120px]">{cls.name}:</span>

                {/* Entry status — read-only for Moved; dropdown for all others */}
                {entry.entryStatus === EntryStatus.MOVED ? (
                  <div className="flex items-center gap-1.5">
                    {getEntryStatusBadge(entry.entryStatus)}
                    {entry.notes && (
                      <span className="text-xs text-muted-foreground">{entry.notes}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                          {getEntryStatusBadge(entry.entryStatus)}
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onClick={() => onStatusChange(entry.id, EntryStatus.PENDING)}
                        >
                          Pending
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onStatusChange(entry.id, EntryStatus.ACCEPTED)}
                        >
                          Accepted
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onStatusChange(entry.id, EntryStatus.WAITLIST)}
                        >
                          Waitlisted
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onStatusChange(entry.id, EntryStatus.REJECTED)}
                        >
                          Not Accepted
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onStatusChange(entry.id, EntryStatus.MISSING_INFO)}
                        >
                          Missing Info
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openWithdrawalDialog(entry.id)}>
                          Withdrawn
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onStatusChange(entry.id, EntryStatus.SCRATCHED)}
                        >
                          Scratched
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setRemoveDialog({ open: true, entry })}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove Entry
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {entry.entryStatus === EntryStatus.CANCELLED && entry.withdrawalReason && (
                      <span className="text-xs text-muted-foreground pl-0.5">
                        {entry.withdrawalReason}
                      </span>
                    )}
                  </div>
                )}

                {/* Check-in status — clickable dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center gap-1 cursor-pointer border border-border/40 rounded px-1.5 py-0.5 hover:border-border transition-colors">
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
                    {Object.values(CHECKIN_STATUS).map(s => (
                      <DropdownMenuItem
                        key={s.value}
                        onClick={() => onCheckInStatusChange(entry, cls, s.value)}
                      >
                        {s.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
              duplicate entries; use Scratched or Withdrawn when the entry should stay in records.
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
